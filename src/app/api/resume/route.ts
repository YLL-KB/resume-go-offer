/**
 * POST /api/resume — 创建新简历
 * GET  /api/resume —  获取当前用户的简历列表
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { resumeDataSchema } from "@/lib/validators/resume.schema";
import { getSessionFromCookie, getUserInfo, isAuthingConfigured } from "@/lib/auth/oidc";
import { eq } from "drizzle-orm";

async function getUserId(request: NextRequest): Promise<string> {
  if (isAuthingConfigured()) {
    const session = getSessionFromCookie(request);
    if (session) {
      try {
        const user = await getUserInfo(session.accessToken);
        return user.sub;
      } catch {
        // fall through to demo user
      }
    }
  }
  // 本地开发 / 未登录 → 使用 demo 用户
  return "demo-user";
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const db = getDb();
    const rows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .all();

    const list = rows.map((r) => ({
      id: r.id,
      title: r.title,
      templateId: r.templateId,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json(list);
  } catch (err) {
    console.error("获取简历列表失败", err);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const body = await request.json() as {
      title?: string;
      templateId?: string;
      data?: unknown;
    };

    const parsed = body.data
      ? resumeDataSchema.parse(body.data)
      : {
          basic: { name: "", email: "", phone: "", location: "", website: "", title: "" },
          summary: "",
          education: [],
          experience: [],
          projects: [],
          skills: [],
        };

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = getDb();

    await db.insert(resumes).values({
      id,
      userId,
      title: body.title ?? "未命名简历",
      templateId: body.templateId ?? "classic",
      data: JSON.stringify(parsed),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      id,
      title: body.title ?? "未命名简历",
      templateId: body.templateId ?? "classic",
      data: parsed,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }, { status: 201 });
  } catch (err) {
    console.error("创建简历失败", err);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
