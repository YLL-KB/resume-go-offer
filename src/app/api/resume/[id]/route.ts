import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { getDb } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { resumeDataSchema } from "@/lib/validators/resume.schema";
import { getAuthUserId } from "@/lib/auth/utils";
import { eq, and } from "drizzle-orm";

// GET /api/resume/[id] — 获取单份简历
export const GET = withRequestLog(async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) => {
  try {
    const { id } = await params;
    const { userId } = await getAuthUserId(request);
    const db = getDb();

    const row = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .get();

    if (!row) {
      return NextResponse.json({ error: "简历不存在" }, { status: 404 });
    }

    return NextResponse.json({
      ...row,
      data: JSON.parse(row.data),
    });
  } catch (err) {
    console.error("获取简历失败", err);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
});

// PATCH /api/resume/[id] — 更新简历数据
export const PATCH = withRequestLog(async (req: NextRequest,
  { params }: { params: Promise<{ id: string }> },) => {
  try {
    const { id } = await params;
    const { userId } = await getAuthUserId(req);
    const body = await req.json() as { data: unknown };
    const parsed = resumeDataSchema.parse(body.data);
    const db = getDb();

    const updated = await db
      .update(resumes)
      .set({
        data: JSON.stringify(parsed),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .returning();

    if (!updated.length) {
      return NextResponse.json({ error: "简历不存在" }, { status: 404 });
    }

    return NextResponse.json({
      ...updated[0],
      data: JSON.parse(updated[0].data),
    });
  } catch (err) {
    console.error("更新简历失败", err);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
});

// DELETE /api/resume/[id] — 删除简历
export const DELETE = withRequestLog(async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) => {
  try {
    const { id } = await params;
    const { userId } = await getAuthUserId(request);
    const db = getDb();

    const result = await db
      .delete(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .returning();

    if (!result.length) {
      return NextResponse.json({ error: "简历不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("删除简历失败", err);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
});
