/**
 * POST /api/chat
 *
 * AI 对话接口 — SSE 流式返回。
 *
 * Body: { conversationId?: string, message: string }
 * Response: text/event-stream
 */

import { NextRequest } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { ai, openai } from "@/lib/ai";
import { SYSTEM_PROMPT, GREETING_NEW_USER } from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getAuthUserId, ANON_COOKIE } from "@/lib/auth/utils";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { eq, asc, and } from "drizzle-orm";
import { streamAgent } from "@/lib/ai/graph";

// 环境变量控制：启用 LangGraph Agent 模式
const USE_LANGGRAPH = process.env.LANGGRAPH_ENABLED === "true";

// 从 LangChain AIMessage.content 提取纯文本（可能是 string 或 content block 数组）
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return "";
      })
      .join("");
  }
  return "";
}

export const POST = withRequestLog(async (request: NextRequest) => {
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
    const { userId, isAnonymous } = await getAuthUserId(request);

    // ── 速率限制 ──
    const rlKey = getRateLimitKey(request);
    const rl = checkRateLimit(rlKey, isAnonymous ? 10 : 30);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "请求过于频繁，请稍后再试" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfter ?? 60),
          },
        },
      );
    }

    // ── 获取或创建对话 ──
    let convId = conversationId;
    if (convId) {
      const existing = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))
        .limit(1);
      if (existing.length === 0) {
        convId = undefined;
      }
    }

    // 匿名用户限制：最多 5 个对话
    if (!convId && isAnonymous) {
      const rows = await (db as ReturnType<typeof getDb>)
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .limit(5);
      if (rows.length >= Number(process.env.ANON_LIMIT || 5)) {
        return new Response(
          JSON.stringify({ error: "limit_reached", message: "未登录用户最多创建5个对话，请登录后继续使用" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
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
      // 新对话预存欢迎语，后续加载历史时直接展示
      await db.insert(messages).values({
        id: crypto.randomUUID(),
        conversationId: convId,
        role: "assistant",
        content: GREETING_NEW_USER,
        createdAt: now,
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
    // LangGraph 模式下不插入 system prompt（Router/Worker 各自管理自己的提示词）
    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = USE_LANGGRAPH
      ? []
      : [{ role: "system", content: SYSTEM_PROMPT }];
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

    let aborted = false;

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          if (aborted) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            aborted = true; // 客户端断开，停止推送但继续生成以保存到 DB
          }
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
                  // 跳过 Router 节点的内部输出，只推送 Worker 内容给前端
                  if ((event as unknown as { metadata?: { langgraph_node?: string } }).metadata?.langgraph_node === "router") break;
                  const content = event.data?.chunk?.content;
                  if (content) {
                    fullReply += content;
                    send({ content, conversationId: convId });
                  }
                  break;
                }
                case "on_chat_model_end": {
                  // 跳过 Router 节点的内部事件
                  if ((event as unknown as { metadata?: { langgraph_node?: string } }).metadata?.langgraph_node === "router") break;
                  const output = event.data?.output;
                  const toolCalls = output?.tool_calls;
                  if (toolCalls && toolCalls.length > 0) {
                    for (const tc of toolCalls) {
                      send({
                        tool_call: { name: tc.name, args: tc.args },
                        conversationId: convId,
                      });
                    }
                  }
                  // workerNode 用 model.invoke()（非流式），不会触发 on_chat_model_stream，
                  // 这里从完整输出兜底提取 Worker 的文本回复
                  const text = extractTextContent(output?.content);
                  if (text) {
                    fullReply += text;
                    send({ content: text, conversationId: convId });
                  }
                  break;
                }
                case "on_tool_end": {
                  // 跳过 Router 节点的工具事件（Router 不使用工具，防御性检查）
                  if ((event as unknown as { metadata?: { langgraph_node?: string } }).metadata?.langgraph_node === "router") break;
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
          if (!aborted) {
            console.error("Stream error:", err);
            send({ error: "AI 回复出错，请重试" });
          }
          // 即使流中断，也把已生成的部分回复落库，避免整条丢失
          if (fullReply) {
            try {
              await db.insert(messages).values({
                id: crypto.randomUUID(),
                conversationId: convId!,
                role: "assistant",
                content: fullReply,
                createdAt: new Date().toISOString(),
              });
            } catch (e) {
              console.error("Failed to save partial AI reply:", e);
            }
          }
          controller.close();
        }
      },
      cancel() {
        aborted = true;
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };
    // 匿名用户：种持久化 Cookie，换 IP 不会丢对话
    if (isAnonymous) {
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
});
