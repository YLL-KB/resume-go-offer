/**
 * PATCH  /api/chat/history/[id] — 重命名对话
 * DELETE /api/chat/history/[id] — 删除对话
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/utils";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json() as { title?: string };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { userId } = await getAuthUserId(request);
  const db = getDb() as ReturnType<typeof getDb>;

  const result = await db
    .update(conversations)
    .set({ title: body.title.trim(), updatedAt: new Date().toISOString() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning();

  if (!result.length) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await getAuthUserId(request);
  const db = getDb() as ReturnType<typeof getDb>;

  // 校验 ownership
  const conv = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);

  if (conv.length === 0) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  // 先删消息，再删对话
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return NextResponse.json({ ok: true });
}
