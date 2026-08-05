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

const ANON_COOKIE = "anon_id";

function getAnonymousId(request: NextRequest): string {
  // 优先从 Cookie 读持久化 ID，避免换 IP 后丢失对话
  const cookieId = request.cookies.get(ANON_COOKIE)?.value;
  if (cookieId) return cookieId;
  return `anon-${crypto.randomUUID()}`;
}

function setAnonymousCookie(response: NextResponse, anonId: string) {
  response.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 年
  });
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

    const response = NextResponse.json({ messages: msgs });
    if (!authUser?.id && userId.startsWith("anon-")) {
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
  if (!authUser?.id && userId.startsWith("anon-")) {
    setAnonymousCookie(response, userId);
  }
  return response;
}
