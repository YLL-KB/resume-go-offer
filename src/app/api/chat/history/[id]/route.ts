/**
 * PATCH  /api/chat/history/[id] — 重命名对话
 * DELETE /api/chat/history/[id] — 删除对话
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json() as { title?: string };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const db = getDb() as ReturnType<typeof getDb>;
  await db
    .update(conversations)
    .set({ title: body.title.trim(), updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb() as ReturnType<typeof getDb>;

  // 先删消息，再删对话
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return NextResponse.json({ ok: true });
}
