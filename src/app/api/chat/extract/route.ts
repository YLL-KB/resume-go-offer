/**
 * POST /api/chat/extract
 *
 * 从对话记录中提取结构化简历数据（SSE）。
 * 与 LangGraph extractResume 工具使用同一套提取逻辑。
 */

import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function POST(request: NextRequest) {
  let conversationId: string;
  let resumeData: Record<string, unknown> | undefined;
  try {
    const body = await request.json() as { conversationId?: string; resumeData?: Record<string, unknown> };
    if (!body.conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }
    conversationId = body.conversationId;
    resumeData = body.resumeData ?? undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const db = getDb() as ReturnType<typeof getDb>;

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  if (history.length === 0) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const conversationText = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `[${m.role === "user" ? "用户" : "顾问"}]: ${m.content}`)
    .join("\n\n");

  // SSE 包装：内部使用与 LangGraph 相同的非流式提取
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "connecting" });

        const result = await ai.extractResumeData(conversationText, resumeData);

        if (result) {
          send({ type: "done", data: result });
        } else {
          send({ type: "error", message: "JSON 解析失败，请重试" });
        }
      } catch (err) {
        console.error("[extract] 失败:", err instanceof Error ? err.message : err);
        send({ type: "error", message: err instanceof Error ? err.message : "提取失败" });
      } finally {
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
}
