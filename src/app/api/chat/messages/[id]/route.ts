/**
 * DELETE /api/chat/messages/[id] — 删除单条消息
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { messages, conversations } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/utils";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await getAuthUserId(request);
  const db = getDb() as ReturnType<typeof getDb>;

  // 先查出消息所属的对话，校验 ownership
  const msg = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1);

  if (msg.length === 0) {
    return NextResponse.json({ error: "消息不存在" }, { status: 404 });
  }

  // 校验该消息所属对话属于当前用户
  const conv = await db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.id, msg[0].conversationId),
      eq(conversations.userId, userId),
    ))
    .limit(1);

  if (conv.length === 0) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  await db.delete(messages).where(eq(messages.id, id));

  return NextResponse.json({ ok: true });
}
