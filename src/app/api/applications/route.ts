/**
 * GET  /api/applications — 获取用户投递列表
 * POST /api/applications — 新增投递记录
 */

import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { getDb } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/utils";
import { eq, desc } from "drizzle-orm";

export const GET = withRequestLog(async (request: NextRequest) => {
  try {
    const { userId } = await getAuthUserId(request);
    const db = getDb();
    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.appliedAt))
      .all();

    return NextResponse.json(rows);
  } catch (err) {
    console.error("获取投递列表失败", err);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
});

export const POST = withRequestLog(async (request: NextRequest) => {
  try {
    const { userId, isAnonymous } = await getAuthUserId(request);
    if (isAnonymous) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body = await request.json() as {
      resumeId?: string;
      company?: string;
      position?: string;
      notes?: string;
    };

    if (!body.company?.trim() || !body.position?.trim()) {
      return NextResponse.json({ error: "公司和职位为必填项" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = getDb();

    await db.insert(applications).values({
      id,
      userId,
      resumeId: body.resumeId ?? "",
      company: body.company.trim(),
      position: body.position.trim(),
      status: "applied",
      appliedAt: now,
      notes: body.notes ?? "",
    });

    return NextResponse.json({
      id,
      userId,
      resumeId: body.resumeId ?? "",
      company: body.company.trim(),
      position: body.position.trim(),
      status: "applied",
      appliedAt: now,
      notes: body.notes ?? "",
    }, { status: 201 });
  } catch (err) {
    console.error("创建投递失败", err);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
});
