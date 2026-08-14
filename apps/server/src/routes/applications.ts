/**
 * 投递记录路由 — 列表 / 新增 / 更新 / 删除。
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { applications } from "../db/schema";
import { getAuthUserId } from "../lib/auth/utils";
import { eq, desc, and } from "drizzle-orm";

export const applicationsRoutes = new Hono();

// ── GET /api/applications ──
applicationsRoutes.get("/", async (c) => {
  try {
    const { userId } = await getAuthUserId(c.req.raw);
    const db = getDb();
    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.appliedAt))
      .all();

    return c.json(rows);
  } catch (err) {
    console.error("获取投递列表失败", err);
    return c.json({ error: "获取失败" }, 500);
  }
});

// ── POST /api/applications ──
applicationsRoutes.post("/", async (c) => {
  try {
    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
    if (isAnonymous) {
      return c.json({ error: "请先登录" }, 401);
    }

    const body = await c.req.json() as {
      resumeId?: string;
      company?: string;
      position?: string;
      notes?: string;
    };

    if (!body.company?.trim() || !body.position?.trim()) {
      return c.json({ error: "公司和职位为必填项" }, 400);
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

    return c.json({
      id,
      userId,
      resumeId: body.resumeId ?? "",
      company: body.company.trim(),
      position: body.position.trim(),
      status: "applied",
      appliedAt: now,
      notes: body.notes ?? "",
    }, 201);
  } catch (err) {
    console.error("创建投递失败", err);
    return c.json({ error: "创建失败" }, 500);
  }
});

// ── PATCH /api/applications/:id ──
applicationsRoutes.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId } = await getAuthUserId(c.req.raw);
    const body = await c.req.json() as { status?: string; notes?: string };
    const db = getDb();

    const updates: Record<string, string> = {};
    if (body.status) {
      const validStatuses = ["applied", "screening", "interview", "offer", "rejected"];
      if (!validStatuses.includes(body.status)) {
        return c.json({ error: "无效状态" }, 400);
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
      return c.json({ error: "投递记录不存在" }, 404);
    }

    return c.json(result[0]);
  } catch (err) {
    console.error("更新投递失败", err);
    return c.json({ error: "更新失败" }, 500);
  }
});

// ── DELETE /api/applications/:id ──
applicationsRoutes.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId } = await getAuthUserId(c.req.raw);
    const db = getDb();

    const result = await db
      .delete(applications)
      .where(and(eq(applications.id, id), eq(applications.userId, userId)))
      .returning();

    if (!result.length) {
      return c.json({ error: "投递记录不存在" }, 404);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("删除投递失败", err);
    return c.json({ error: "删除失败" }, 500);
  }
});
