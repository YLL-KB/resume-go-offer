/**
 * PATCH  /api/applications/[id] — 更新投递状态/备注
 * DELETE /api/applications/[id] — 删除投递记录
 */

import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { getDb } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/utils";
import { eq, and } from "drizzle-orm";

export const PATCH = withRequestLog(async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) => {
  try {
    const { id } = await params;
    const { userId } = await getAuthUserId(request);
    const body = await request.json() as { status?: string; notes?: string };
    const db = getDb();

    const updates: Record<string, string> = {};
    if (body.status) {
      const validStatuses = ["applied", "screening", "interview", "offer", "rejected"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: "无效状态" }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes;
    }

    const result = await db
      .update(applications)
      .set(updates)
      .where(and(eq(applications.id, id), eq(applications.userId, userId)))
      .returning();

    if (!result.length) {
      return NextResponse.json({ error: "投递记录不存在" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("更新投递失败", err);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
});

export const DELETE = withRequestLog(async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) => {
  try {
    const { id } = await params;
    const { userId } = await getAuthUserId(request);
    const db = getDb();

    const result = await db
      .delete(applications)
      .where(and(eq(applications.id, id), eq(applications.userId, userId)))
      .returning();

    if (!result.length) {
      return NextResponse.json({ error: "投递记录不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("删除投递失败", err);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
});
