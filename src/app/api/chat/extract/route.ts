/**
 * POST /api/chat/extract
 *
 * 从对话记录中提取结构化简历数据。
 * Body: { conversationId: string }
 * Response: { data: ResumeData }
 */

import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function POST(request: NextRequest) {
  let conversationId: string;
  try {
    const body = await request.json() as { conversationId?: string };
    if (!body.conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }
    conversationId = body.conversationId;
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

  // 调用 AI 提取
  const data = await ai.extractResumeData(conversationText);

  if (!data) {
    return NextResponse.json(
      { error: "提取失败，请再聊几句后重试" },
      { status: 422 },
    );
  }

  return NextResponse.json({ data });
}
