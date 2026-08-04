/**
 * POST /api/chat/extract
 *
 * 从对话记录中流式提取结构化简历数据（SSE）。
 * Body: { conversationId: string }
 *
 * SSE 事件：
 *   data: {"type":"chunk","content":"..."}   — AI 生成片段
 *   data: {"type":"done","data":{...}}        — 提取完成，结构化数据
 *   data: {"type":"error","message":"..."}     — 失败
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
    resumeData = body.resumeData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const db = getDb() as ReturnType<typeof getDb>;

  // 读取对话全部消息
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  if (history.length === 0) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 拼接对话记录文本
  const conversationText = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `[${m.role === "user" ? "用户" : "顾问"}]: ${m.content}`)
    .join("\n\n");

  // 流式提取
  const stream = ai.extractResumeDataStream(conversationText, resumeData);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
