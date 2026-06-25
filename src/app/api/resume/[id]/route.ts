import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { resumeDataSchema } from "@/lib/validators/resume.schema";
import { eq } from "drizzle-orm";

// GET /api/resume/[id] — 获取单份简历
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = await db.select().from(resumes).where(eq(resumes.id, id)).get();

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
}

// PATCH /api/resume/[id] — 更新简历数据
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json() as { data: unknown };
    const parsed = resumeDataSchema.parse(body.data);
    const db = getDb();

    const updated = await db
      .update(resumes)
      .set({
        data: JSON.stringify(parsed),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(resumes.id, id))
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
}
