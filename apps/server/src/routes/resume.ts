/**
 * 简历路由 — 列表 / 创建 / 详情 / 更新 / 删除 / 技能渲染。
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { resumes } from "../db/schema";
import { resumeDataSchema } from "../lib/resume.schema";
import { getAuthUserId } from "../lib/auth/utils";
import { renderSkillsHtml } from "../lib/skills-html";
import { THEMES, type ResumeTheme } from "../lib/theme-utils";
import { eq, and } from "drizzle-orm";

export const resumeRoutes = new Hono();

// ── GET /api/resume ──
resumeRoutes.get("/", async (c) => {
  try {
    const { userId } = await getAuthUserId(c.req.raw);
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

    return c.json(list);
  } catch (err) {
    console.error("获取简历列表失败", err);
    return c.json({ error: "获取失败" }, 500);
  }
});

// ── POST /api/resume ──
resumeRoutes.post("/", async (c) => {
  try {
    const { userId } = await getAuthUserId(c.req.raw);
    const body = await c.req.json() as {
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

    return c.json({
      id,
      title: body.title ?? "未命名简历",
      templateId: body.templateId ?? "classic",
      data: parsed,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }, 201);
  } catch (err) {
    console.error("创建简历失败", err);
    return c.json({ error: "创建失败" }, 500);
  }
});

// ── POST /api/resume/render-skills ──
resumeRoutes.post("/render-skills", async (c) => {
  let body: { categorizedSkills?: Record<string, string[]>; theme?: string };
  try {
    body = await c.req.json() as typeof body;
    if (!body.categorizedSkills || typeof body.categorizedSkills !== "object") {
      return c.json({ error: "categorizedSkills is required" }, 400);
    }
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const theme: ResumeTheme = (body.theme && ["ocean", "forest", "slate", "warm"].includes(body.theme))
    ? (body.theme as ResumeTheme)
    : "ocean";
  const t = THEMES[theme];
  const html = renderSkillsHtml(body.categorizedSkills, t.catColors, t.textMuted);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", html })}\n\n`));
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// ── GET /api/resume/:id ──
resumeRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId } = await getAuthUserId(c.req.raw);
    const db = getDb();

    const row = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .get();

    if (!row) {
      return c.json({ error: "简历不存在" }, 404);
    }

    return c.json({
      ...row,
      data: JSON.parse(row.data),
    });
  } catch (err) {
    console.error("获取简历失败", err);
    return c.json({ error: "获取失败" }, 500);
  }
});

// ── PATCH /api/resume/:id ──
resumeRoutes.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId } = await getAuthUserId(c.req.raw);
    const body = await c.req.json() as { data: unknown };
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
      return c.json({ error: "简历不存在" }, 404);
    }

    return c.json({
      ...updated[0],
      data: JSON.parse(updated[0].data),
    });
  } catch (err) {
    console.error("更新简历失败", err);
    return c.json({ error: "更新失败" }, 500);
  }
});

// ── DELETE /api/resume/:id ──
resumeRoutes.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId } = await getAuthUserId(c.req.raw);
    const db = getDb();

    const result = await db
      .delete(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .returning();

    if (!result.length) {
      return c.json({ error: "简历不存在" }, 404);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("删除简历失败", err);
    return c.json({ error: "删除失败" }, 500);
  }
});
