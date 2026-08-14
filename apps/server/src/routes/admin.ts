/**
 * 管理后台路由 — 请求日志查询/清理/统计、用户管理。
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { requestLogs, users, conversations, messages, resumes, applications } from "../db/schema";
import { getAdminUser } from "../lib/auth/admin";
import { and, gte, lte, desc, like, eq } from "drizzle-orm";

export const adminRoutes = new Hono();

// ── GET /api/admin/logs ──
adminRoutes.get("/logs", async (c) => {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();

    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const pageSize = Math.min(Math.max(1, parseInt(c.req.query("pageSize") ?? "50", 10)), 200);

    const pathFilter = c.req.query("path") ?? undefined;
    const methodFilter = c.req.query("method") ?? undefined;
    const statusCodeRaw = c.req.query("statusCode");
    const statusCodeFilter = statusCodeRaw ? parseInt(statusCodeRaw, 10) : undefined;
    const userIdFilter = c.req.query("userId") ?? undefined;
    const startDate = c.req.query("startDate") ?? undefined;
    const endDate = c.req.query("endDate") ?? undefined;

    const conditions = [];
    if (pathFilter) conditions.push(like(requestLogs.path, `%${pathFilter}%`));
    if (methodFilter) conditions.push(eq(requestLogs.method, methodFilter.toUpperCase()));
    if (statusCodeFilter !== undefined) conditions.push(eq(requestLogs.statusCode, statusCodeFilter));
    if (userIdFilter) conditions.push(eq(requestLogs.userId, userIdFilter));
    if (startDate) conditions.push(gte(requestLogs.timestamp, startDate));
    if (endDate) conditions.push(lte(requestLogs.timestamp, endDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const allRows = await db
      .select()
      .from(requestLogs)
      .where(where)
      .orderBy(desc(requestLogs.timestamp))
      .all();

    const total = allRows.length;
    const offset = (page - 1) * pageSize;
    const rows = allRows.slice(offset, offset + pageSize);

    return c.json({ logs: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error("[admin/logs]", err);
    return c.json({ error: "获取日志列表失败" }, 500);
  }
});

// ── DELETE /api/admin/logs ──
adminRoutes.delete("/logs", async (c) => {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();
    const days = Math.max(1, parseInt(c.req.query("days") ?? "7", 10));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const oldLogs = await db
      .select()
      .from(requestLogs)
      .where(lte(requestLogs.timestamp, cutoff))
      .all();

    const deleted = oldLogs.length;

    if (deleted > 0) {
      await db.delete(requestLogs).where(lte(requestLogs.timestamp, cutoff)).run();
    }

    return c.json({ ok: true, deleted, message: `已清理 ${deleted} 条 ${days} 天前的日志` });
  } catch (err) {
    console.error("[admin/logs] cleanup error:", err);
    return c.json({ error: "清理日志失败" }, 500);
  }
});

// ── GET /api/admin/logs/stats ──
adminRoutes.get("/logs/stats", async (c) => {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();

    const endDate = c.req.query("endDate") ?? new Date().toISOString();
    const startDate =
      c.req.query("startDate") ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

    const dateRange = and(
      gte(requestLogs.timestamp, startDate),
      lte(requestLogs.timestamp, endDate),
    );
    const todayRange = and(
      gte(requestLogs.timestamp, todayStart),
      lte(requestLogs.timestamp, todayEnd),
    );

    const [todayLogs, rangeLogs] = await Promise.all([
      db.select().from(requestLogs).where(todayRange).all(),
      db.select().from(requestLogs).where(dateRange).all(),
    ]);

    // JS 聚合
    const todayRequests = todayLogs.length;
    const totalRequests = rangeLogs.length;
    const errorCount = rangeLogs.filter((l) => l.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 100 * 100) / 100 : 0;

    const userIds = new Set(rangeLogs.filter((l) => l.userId).map((l) => l.userId));
    const activeUsers = userIds.size;

    const totalDuration = rangeLogs.reduce((sum, l) => sum + l.durationMs, 0);
    const avgResponseTime = totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0;

    // Top endpoints
    const endpointMap = new Map<string, { count: number; totalDuration: number }>();
    for (const l of rangeLogs) {
      const entry = endpointMap.get(l.path) ?? { count: 0, totalDuration: 0 };
      entry.count++;
      entry.totalDuration += l.durationMs;
      endpointMap.set(l.path, entry);
    }
    const topEndpoints = [...endpointMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([path, v]) => ({ path, count: v.count, avgDuration: Math.round(v.totalDuration / v.count) }));

    // Top users
    const userMap = new Map<string, number>();
    for (const l of rangeLogs) {
      if (!l.userId) continue;
      userMap.set(l.userId, (userMap.get(l.userId) ?? 0) + 1);
    }
    const topUsers = [...userMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    // Requests over time (by day)
    const dayMap = new Map<string, { count: number; errors: number }>();
    for (const l of rangeLogs) {
      const day = l.timestamp.substring(0, 10);
      const entry = dayMap.get(day) ?? { count: 0, errors: 0 };
      entry.count++;
      if (l.statusCode >= 400) entry.errors++;
      dayMap.set(day, entry);
    }
    const requestsOverTime = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));

    return c.json({
      todayRequests,
      totalRequests,
      errorCount,
      errorRate,
      activeUsers,
      avgResponseTime,
      topEndpoints,
      topUsers,
      requestsOverTime,
    });
  } catch (err) {
    console.error("[admin/logs/stats]", err);
    return c.json({ error: "获取统计数据失败" }, 500);
  }
});

// ── GET /api/admin/users ──
adminRoutes.get("/users", async (c) => {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt)).all();

    const result = await Promise.all(
      allUsers.map(async (u) => {
        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.userId, u.id))
          .all();
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          avatarUrl: u.avatarUrl,
          githubLogin: u.githubLogin,
          createdAt: u.createdAt,
          conversationCount: rows.length,
        };
      })
    );

    return c.json({ users: result });
  } catch (err) {
    console.error("Admin users error:", err);
    return c.json({ error: "获取用户列表失败" }, 500);
  }
});

// ── DELETE /api/admin/users/:id ──
adminRoutes.delete("/users/:id", async (c) => {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return c.json({ error: "无权限" }, 403);

  const id = c.req.param("id");

  // 不能删除自己
  if (id === admin.id) {
    return c.json({ error: "不能删除自己" }, 400);
  }

  try {
    const db = getDb();

    // 验证目标用户存在
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1).all();
    if (!target) return c.json({ error: "用户不存在" }, 404);

    // 获取该用户所有对话 ID
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, id))
      .all();

    // 级联删除：messages → conversations → resumes → applications → user
    for (const conv of userConversations) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    await db.delete(conversations).where(eq(conversations.userId, id));
    await db.delete(resumes).where(eq(resumes.userId, id));
    await db.delete(applications).where(eq(applications.userId, id));
    await db.delete(users).where(eq(users.id, id));

    return c.json({ ok: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    return c.json({ error: "删除用户失败" }, 500);
  }
});

// ── GET /api/admin/users/:id/conversations ──
adminRoutes.get("/users/:id/conversations", async (c) => {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return c.json({ error: "无权限" }, 403);

  const id = c.req.param("id");

  try {
    const db = getDb();

    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, id))
      .orderBy(desc(conversations.updatedAt))
      .all();

    const result = await Promise.all(
      userConversations.map(async (conv) => {
        const msgRows = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .all();
        return {
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: msgRows.length,
        };
      })
    );

    return c.json({ conversations: result });
  } catch (err) {
    console.error("Admin conversations error:", err);
    return c.json({ error: "获取对话列表失败" }, 500);
  }
});
