/**
 * POST /api/chat
 *
 * AI 对话接口 — SSE 流式返回。
 *
 * Body: { conversationId?: string, message: string }
 * Response: text/event-stream
 */

import { NextRequest } from "next/server";
import { ai } from "@/lib/ai";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { eq, asc } from "drizzle-orm";

// 匿名用户 ID（未登录时使用）
function getAnonymousId(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const ua = request.headers.get("user-agent") ?? "";
  return "anon-" + Buffer.from(ip + ua).toString("base64").slice(0, 32);
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
        title: message.slice(0, 50),
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

    // ── 保存用户消息 ──
    await db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "user",
      content: message.trim(),
      createdAt: now,
    });

    // ── 调用 AI 流式输出 ──
    const stream = await ai.chat(chatMessages);

    // ── 收集完整回复（用于后续持久化） ──
    let fullReply = "";

    // ── SSE 流式返回 ──
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullReply += content;
              const sse = `data: ${JSON.stringify({ content, conversationId: convId })}\n\n`;
              controller.enqueue(encoder.encode(sse));
            }
          }

          // 保存 AI 回复
          if (fullReply) {
            try {
              await db.insert(messages).values({
                id: crypto.randomUUID(),
                conversationId: convId!,
                role: "assistant",
                content: fullReply,
                createdAt: new Date().toISOString(),
              });
            } catch (saveErr) {
              console.error("Failed to save AI reply:", saveErr);
            }
          }

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "AI 回复出错，请重试" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "服务器错误" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
