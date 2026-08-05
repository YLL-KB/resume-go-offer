/**
 * POST /api/chat
 *
 * AI 对话接口 — SSE 流式返回。
 *
 * Body: { conversationId?: string, message: string }
 * Response: text/event-stream
 */

import { NextRequest } from "next/server";
import { ai, openai } from "@/lib/ai";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { eq, asc } from "drizzle-orm";
import { streamAgent } from "@/lib/ai/graph";

// 环境变量控制：启用 LangGraph Agent 模式
const USE_LANGGRAPH = process.env.LANGGRAPH_ENABLED === "true";

const ANON_COOKIE = "anon_id";

// 匿名用户 ID（未登录时使用，基于持久化 Cookie）
function getAnonymousId(request: NextRequest): string {
  const cookieId = request.cookies.get(ANON_COOKIE)?.value;
  if (cookieId) return cookieId;
  return `anon-${crypto.randomUUID()}`;
}

export async function POST(request: NextRequest) {
  // ── 解析请求 ──
  let body: { conversationId?: string; message: string };
  try {
    body = await request.json() as { conversationId?: string; message: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { conversationId, message } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const db = getDb() as ReturnType<typeof getDb>;
    const now = new Date().toISOString();

    // ── 确定用户 ID ──
    const authUser = await getUser(request);
    const userId = authUser?.id ?? getAnonymousId(request);

    // ── 获取或创建对话 ──
    let convId = conversationId;
    if (convId) {
      const existing = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId))
        .limit(1);
      if (existing.length === 0) {
        convId = undefined;
      }
    }

    if (!convId) {
      convId = crypto.randomUUID();
      await db.insert(conversations).values({
        id: convId,
        userId,
        title: "新对话",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, convId));
    }

    // ── 读取历史消息 ──
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(asc(messages.createdAt));

    // ── 拼接 messages ──
    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];
    for (const msg of history.slice(-30)) {
      if (msg.role === "user" || msg.role === "assistant") {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }
    chatMessages.push({ role: "user", content: message.trim() });

    // ── 保存用户消息（并行，不阻塞 AI 调用）──
    const userMsgSaved = db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "user",
      content: message.trim(),
      createdAt: now,
    });

    // ── 调用 AI 流式输出（LangGraph Agent 或 原始 Chat）──
    const encoder = new TextEncoder();
    let fullReply = "";

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // 确保用户消息已落库再开始（通常 AI 调用 TTFB 更长，此处几乎零等待）
          await userMsgSaved;

          if (USE_LANGGRAPH) {
            // ── LangGraph Agent 模式 ──
            const agentInput = chatMessages.filter(
              (m): m is { role: "user" | "assistant" | "system"; content: string } =>
                m.role === "user" || m.role === "assistant" || m.role === "system",
            );

            for await (const event of streamAgent({ messages: agentInput })) {
              switch (event.event) {
                case "on_chat_model_stream": {
                  const content = event.data?.chunk?.content;
                  if (content) {
                    fullReply += content;
                    send({ content, conversationId: convId });
                  }
                  break;
                }
                case "on_chat_model_end": {
                  const toolCalls = event.data?.output?.tool_calls;
                  if (toolCalls && toolCalls.length > 0) {
                    for (const tc of toolCalls) {
                      send({
                        tool_call: { name: tc.name, args: tc.args },
                        conversationId: convId,
                      });
                    }
                  }
                  break;
                }
                case "on_tool_end": {
                  if (event.name === "extractResume") {
                    const raw = event.data?.output;
                    if (typeof raw === "string") {
                      try {
                        const parsed = JSON.parse(raw);
                        send({ resumeData: parsed, conversationId: convId });
                      } catch {
                        send({ error: "简历数据解析失败" });
                      }
                    }
                  }
                  break;
                }
              }
            }
          } else {
            // ── 原始 Chat 模式（兼容旧行为）──
            const stream = await ai.chat(chatMessages);

            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                fullReply += content;
                send({ content, conversationId: convId });
              }
            }
          }

          // ── 保存 AI 回复与生成标题并行 ──
          if (fullReply) {
            const savePromise = db.insert(messages).values({
              id: crypto.randomUUID(),
              conversationId: convId!,
              role: "assistant",
              content: fullReply,
              createdAt: new Date().toISOString(),
            });

            let titlePromise: Promise<unknown> = Promise.resolve();
            if (history.length === 0) {
              titlePromise = openai.chat.completions.create({
                model: process.env.AI_MODEL ?? "gpt-4o-mini",
                temperature: 0.3,
                max_tokens: 30,
                messages: [
                  { role: "system", content: "根据用户和AI的第一轮对话，生成一个简短的对话标题（8字以内）。只返回标题文本。" },
                  { role: "user", content: `用户: ${message.trim()}\nAI: ${fullReply.slice(0, 200)}` },
                ],
              }).then(async (titleRes) => {
                const title = titleRes.choices[0]?.message?.content?.trim()?.replace(/["「」""]/g, "") ?? "新对话";
                await db.update(conversations).set({ title: title.slice(0, 20) }).where(eq(conversations.id, convId!));
                send({ title: title.slice(0, 20) });
              }).catch(() => { /* 标题生成失败不影响对话 */ });
            }

            await Promise.all([savePromise.catch((e: unknown) => console.error("Failed to save AI reply:", e)), titlePromise]);
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          send({ error: "AI 回复出错，请重试" });
          controller.close();
        }
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };
    // 匿名用户：种持久化 Cookie，换 IP 不会丢对话
    if (!authUser?.id && userId.startsWith("anon-")) {
      headers["Set-Cookie"] = `${ANON_COOKIE}=${userId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;
    }

    return new Response(readable, { headers });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "服务器错误" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
