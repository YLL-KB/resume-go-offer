/**
 * GET /api/chat/history
 *
 * 返回对话列表或指定对话的消息。
 * ?conversationId=xxx → 返回该对话的消息
 * 无参 → 返回用户的所有对话列表
 */

import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getAuthUserId, setAnonymousCookie } from "@/lib/auth/utils";
import { eq, desc, asc, and } from "drizzle-orm";

export const GET = withRequestLog(async (request: NextRequest) => {
  const db = getDb() as ReturnType<typeof getDb>;
  const { userId, isAnonymous } = await getAuthUserId(request);

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  // 返回指定对话的消息（需校验 ownership）
  if (conversationId) {
    // 先校验对话属于当前用户
    const conv = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
      .limit(1);

    if (conv.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    const response = NextResponse.json({ messages: msgs });
    if (isAnonymous) {
      setAnonymousCookie(response, userId);
    }
    return response;
  }

  // 返回对话列表
  const list = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);

  const response = NextResponse.json({ conversations: list });
  if (isAnonymous) {
    setAnonymousCookie(response, userId);
  }
  return response;
});
