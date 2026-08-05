/**
 * DELETE /api/chat/messages/[id] — 删除单条消息
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb() as ReturnType<typeof getDb>;

  await db.delete(messages).where(eq(messages.id, id));

  return NextResponse.json({ ok: true });
}
