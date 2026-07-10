/**
 * GET /api/chat/history
 *
 * 返回对话列表或指定对话的消息。
 * ?conversationId=xxx → 返回该对话的消息
 * 无参 → 返回用户的所有对话列表
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { eq, desc, asc } from "drizzle-orm";

function getAnonymousId(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const ua = request.headers.get("user-agent") ?? "";
  return "anon-" + Buffer.from(ip + ua).toString("base64").slice(0, 32);
}

export async function GET(request: NextRequest) {
  const db = getDb() as ReturnType<typeof getDb>;
  const authUser = await getUser(request);
  const userId = authUser?.id ?? getAnonymousId(request);

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  // 返回指定对话的消息
  if (conversationId) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    return NextResponse.json({ messages: msgs });
  }

  // 返回对话列表
  const list = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);

  return NextResponse.json({ conversations: list });
}
