/**
 * 管理后台路由 — 请求日志查询/清理/统计、用户管理。
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getDb } from "../db";
import {
  requestLogs,
  users,
  conversations,
  messages,
  resumes,
  applications,
  aiTraces,
  aiSpans,
  aiEvents,
  roles,
  userRoles,
  plans,
  userPlans,
  tokenUsage,
  userAiApis,
} from "../db/schema";
import { decryptApiKey, maskApiKey } from "../lib/billing/byok";
import { getAdminUser, getAdminPermissions, requirePermission } from "../lib/auth/admin";
import { WILDCARD } from "../lib/auth/permissions";
import type { AdminUser } from "../lib/auth/admin";
import { and, gte, lte, desc, asc, like, eq, inArray, sql, count, isNull } from "drizzle-orm";

export const adminRoutes = new Hono();

/** 校验指定权限点，通过则返回 AdminUser（供需要 admin.id 的路由用），否则 null */
async function requireAdmin(c: Context, permission: string): Promise<AdminUser | null> {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return null;
  if (!(await requirePermission(c.req.raw, permission))) return null;
  return admin;
}

/** 授权校验错误：携带 HTTP 状态码 */
class GrantError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 防提权：校验待授予的角色列表是否超出操作者权限——
 * 含通配 * 或 admin.permissions 的角色是权限边界，只有超级管理员才能授予。
 */
async function assertRoleGrantsAllowed(c: Context, roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  const db = getDb();
  const existing = await db
    .select({ id: roles.id, label: roles.label, permissions: roles.permissions })
    .from(roles)
    .where(inArray(roles.id, roleIds))
    .all();
  if (existing.length !== roleIds.length) throw new GrantError("包含不存在的角色", 400);

  const operatorPerms = await getAdminPermissions(c.req.raw);
  const isSuper = operatorPerms?.has(WILDCARD) ?? false;
  if (isSuper) return;

  for (const r of existing) {
    let perms: string[] = [];
    try {
      perms = JSON.parse(r.permissions);
    } catch {
      perms = [];
    }
    if (perms.includes(WILDCARD) || perms.includes("admin.permissions")) {
      throw new GrantError(`无权授予角色「${r.label}」，请联系超级管理员`, 403);
    }
  }
}

// ── GET /api/admin/me ── 当前后台用户的权限点（前端导航/鉴权用）
adminRoutes.get("/me", async (c) => {
  const admin = await getAdminUser(c.req.raw);
  if (!admin) return c.json({ error: "无权限" }, 403);
  const permissions = await getAdminPermissions(c.req.raw);
  return c.json({ id: admin.id, name: admin.name, permissions: permissions ? [...permissions] : [] });
});

// ── GET /api/admin/logs ──
adminRoutes.get("/logs", async (c) => {
  const admin = await requireAdmin(c, "admin.logs");
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
  const admin = await requireAdmin(c, "admin.logs");
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
  const admin = await requireAdmin(c, "admin.logs");
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

// ── GET /api/admin/usage ── Token 用量报表（记账阶段，只读不拦截）
adminRoutes.get("/usage", async (c) => {
  const admin = await requireAdmin(c, "admin.logs");
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const { getGlobalUsage, getFreeTierLimits } = await import("../lib/billing/ledger");
    const days = Math.max(1, Math.min(90, Number(c.req.query("days")) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const total = getGlobalUsage(since);

    // Top 用户（按总 token 降序，JS 排序避免 SQL 别名问题）
    const db = getDb();
    const topUserRows = db
      .select({
        userId: tokenUsage.userId,
        tokens: sql<number>`COALESCE(SUM(${sql.raw("input_tokens")} + ${sql.raw("output_tokens")}), 0)`,
        costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
      })
      .from(tokenUsage)
      .where(gte(tokenUsage.createdAt, since))
      .groupBy(tokenUsage.userId)
      .all();

    const topUsers = topUserRows
      .map((r) => ({
        userId: r.userId,
        tokens: Number(r.tokens ?? 0),
        costCents: Number(r.costCents ?? 0),
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

    // ── 免费额度消耗：本月平台对话次数（source=chat & provider=platform）──
    const limits = getFreeTierLimits();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const chatRows = db
      .select({ userId: tokenUsage.userId, turns: count() })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.provider, "platform"),
          eq(tokenUsage.source, "chat"),
          gte(tokenUsage.createdAt, monthStart),
        ),
      )
      .groupBy(tokenUsage.userId)
      .all();

    // 登录用户名字映射（匿名 userId 不在 users 表）
    const userRows = await db
      .select({ id: users.id, name: users.name, githubLogin: users.githubLogin })
      .from(users)
      .all();
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const freeTierByUser = chatRows
      .map((r) => {
        const isAnonymous = !userMap.has(r.userId);
        const u = userMap.get(r.userId);
        const limit = isAnonymous ? limits.anon : limits.loggedIn;
        const turns = Number(r.turns ?? 0);
        return {
          userId: r.userId,
          isAnonymous,
          name: u?.name ?? null,
          githubLogin: u?.githubLogin ?? null,
          turns,
          limit,
          reached: turns >= limit,
        };
      })
      .sort((a, b) => b.turns - a.turns);

    const freeTier = {
      limits,
      monthStart,
      totalTurns: freeTierByUser.reduce((s, x) => s + x.turns, 0),
      anonTurns: freeTierByUser.filter((x) => x.isAnonymous).reduce((s, x) => s + x.turns, 0),
      loggedInTurns: freeTierByUser.filter((x) => !x.isAnonymous).reduce((s, x) => s + x.turns, 0),
      anonUsers: freeTierByUser.filter((x) => x.isAnonymous).length,
      loggedInUsers: freeTierByUser.filter((x) => !x.isAnonymous).length,
      byUser: freeTierByUser,
    };

    return c.json({
      days,
      since,
      total,
      topUsers,
      freeTier,
    });
  } catch (err) {
    console.error("[admin/usage]", err);
    return c.json({ error: "获取用量统计失败", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ── GET /api/admin/users ──
adminRoutes.get("/users", async (c) => {
  const admin = await requireAdmin(c, "admin.users");
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt)).all();

    // 搜索（按名字 / GitHub 用户名 / 邮箱模糊匹配）
    const q = c.req.query("q")?.trim().toLowerCase() ?? "";
    const filtered = q
      ? allUsers.filter((u) =>
          [u.name, u.githubLogin, u.email].some((v) => v?.toLowerCase().includes(q)),
        )
      : allUsers;

    // 30 天 token 用量（一次分组查询，避免 N+1）
    const usageSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const usageRows = db
      .select({
        userId: tokenUsage.userId,
        tokens: sql<number>`COALESCE(SUM(${sql.raw("input_tokens")} + ${sql.raw("output_tokens")}), 0)`,
        costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
        calls: sql<number>`COUNT(*)`,
      })
      .from(tokenUsage)
      .where(gte(tokenUsage.createdAt, usageSince))
      .groupBy(tokenUsage.userId)
      .all();
    const usageMap = new Map(usageRows.map((r) => [r.userId, r]));

    const result = await Promise.all(
      filtered.map(async (u) => {
        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.userId, u.id))
          .all();

        // 角色（label 列表）
        const roleLinks = await db
          .select({ roleId: userRoles.roleId })
          .from(userRoles)
          .where(eq(userRoles.userId, u.id))
          .all();
        let roleLabels: string[] = [];
        if (roleLinks.length > 0) {
          const roleRows = await db
            .select({ label: roles.label })
            .from(roles)
            .where(inArray(roles.id, roleLinks.map((r) => r.roleId)))
            .all();
          roleLabels = roleRows.map((r) => r.label);
        }

        // 套餐（label，无则 null）
        const [planLink] = await db
          .select()
          .from(userPlans)
          .where(eq(userPlans.userId, u.id))
          .limit(1)
          .all();
        let planLabel: string | null = null;
        if (planLink) {
          const [planRow] = await db
            .select({ label: plans.label })
            .from(plans)
            .where(eq(plans.id, planLink.planId))
            .limit(1)
            .all();
          planLabel = planRow?.label ?? null;
        }

        const usage = usageMap.get(u.id);

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          avatarUrl: u.avatarUrl,
          githubLogin: u.githubLogin,
          createdAt: u.createdAt,
          conversationCount: rows.length,
          roles: roleLabels,
          roleIds: roleLinks.map((r) => r.roleId),
          plan: planLabel,
          planId: planLink?.planId ?? null,
          isAnonymous: !u.githubId && !u.authingSub && !u.githubLogin,
          pendingLogin: !u.githubId && !!u.githubLogin,
          usage30d: usage
            ? {
                tokens: Number(usage.tokens ?? 0),
                costCents: Number(usage.costCents ?? 0),
                calls: Number(usage.calls ?? 0),
              }
            : { tokens: 0, costCents: 0, calls: 0 },
        };
      })
    );

    return c.json({ users: result });
  } catch (err) {
    console.error("Admin users error:", err);
    return c.json({ error: "获取用户列表失败" }, 500);
  }
});

// ── POST /api/admin/users ── 预建人员：按 GitHub 用户名占位，
// 对方首次用 GitHub 登录时（auth callback 按 githubLogin 匹配）自动关联生效
adminRoutes.post("/users", async (c) => {
  const admin = await requireAdmin(c, "admin.permissions");
  if (!admin) return c.json({ error: "无权限" }, 403);

  const body = await c.req.json().catch(() => null);
  const githubLogin = String(body?.githubLogin ?? "").trim();
  const name = body?.name != null ? String(body.name).trim() : "";
  const roleIds = Array.isArray(body?.roleIds) ? body.roleIds.map(String).filter(Boolean) : [];
  const planId = body?.planId != null && body.planId !== "" ? String(body.planId) : null;
  const expiresAt = body?.expiresAt != null && body.expiresAt !== "" ? String(body.expiresAt) : null;

  if (!githubLogin) return c.json({ error: "请输入 GitHub 用户名" }, 400);
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(githubLogin)) {
    return c.json({ error: "GitHub 用户名格式不正确（仅字母、数字、连字符）" }, 400);
  }

  try {
    await assertRoleGrantsAllowed(c, roleIds);
  } catch (err) {
    if (err instanceof GrantError) return c.json({ error: err.message }, err.status as 400 | 403);
    throw err;
  }

  try {
    const db = getDb();

    // GitHub 用户名查重（含已登录用户与已预建人员）
    const dup = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.githubLogin, githubLogin))
      .all();
    if (dup.length > 0) return c.json({ error: "该 GitHub 用户名已存在" }, 409);

    if (planId) {
      const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, planId)).limit(1).all();
      if (!plan) return c.json({ error: "套餐不存在" }, 400);
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    db.insert(users)
      .values({
        id: userId,
        githubId: null,
        githubLogin,
        name: name || githubLogin,
        email: null,
        avatarUrl: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (const roleId of roleIds) {
      db.insert(userRoles)
        .values({ id: crypto.randomUUID(), userId, roleId, assignedBy: admin.id, createdAt: now })
        .run();
    }
    if (planId) {
      db.insert(userPlans)
        .values({ id: crypto.randomUUID(), userId, planId, expiresAt, assignedBy: admin.id, createdAt: now })
        .run();
    }

    return c.json({ ok: true, id: userId });
  } catch (err) {
    console.error("Admin create user error:", err);
    return c.json({ error: "添加人员失败" }, 500);
  }
});

// ── DELETE /api/admin/users/:id ──
adminRoutes.delete("/users/:id", async (c) => {
  const admin = await requireAdmin(c, "admin.users");
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

    // 级联删除：messages → conversations → resumes → applications → 授权 → user
    for (const conv of userConversations) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    await db.delete(conversations).where(eq(conversations.userId, id));
    await db.delete(resumes).where(eq(resumes.userId, id));
    await db.delete(applications).where(eq(applications.userId, id));
    await db.delete(userRoles).where(eq(userRoles.userId, id));
    await db.delete(userPlans).where(eq(userPlans.userId, id));
    await db.delete(users).where(eq(users.id, id));

    return c.json({ ok: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    return c.json({ error: "删除用户失败" }, 500);
  }
});

// ── GET /api/admin/users/:id/conversations ──
adminRoutes.get("/users/:id/conversations", async (c) => {
  const admin = await requireAdmin(c, "admin.users");
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

// ── GET /api/admin/byok ── 谁添加了自带 API（BYOK），按用户聚合、key 掩码
adminRoutes.get("/byok", async (c) => {
  const admin = await requireAdmin(c, "admin.users");
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();
    const rows = db.select().from(userAiApis).orderBy(asc(userAiApis.createdAt)).all();

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const userRows = userIds.length
      ? db
          .select({ id: users.id, name: users.name, githubLogin: users.githubLogin, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
          .all()
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const byUser = new Map<string, {
      userId: string;
      name: string | null;
      githubLogin: string | null;
      email: string | null;
      isAnonymous: boolean;
      apis: unknown[];
    }>();

    for (const r of rows) {
      const u = userMap.get(r.userId);
      const plain = decryptApiKey(r.apiKeyEnc) ?? "";

      let scopes: string[] = [];
      try {
        const v = JSON.parse(r.scopes);
        if (Array.isArray(v)) scopes = v.filter((s): s is string => typeof s === "string");
      } catch {
        scopes = [];
      }

      let entry = byUser.get(r.userId);
      if (!entry) {
        entry = {
          userId: r.userId,
          name: u?.name ?? null,
          githubLogin: u?.githubLogin ?? null,
          email: u?.email ?? null,
          isAnonymous: !u,
          apis: [],
        };
        byUser.set(r.userId, entry);
      }

      entry.apis.push({
        id: r.id,
        name: r.name,
        provider: r.provider,
        baseUrl: r.baseUrl,
        model: r.model,
        scopes,
        isActive: r.isActive === 1,
        maskedKey: plain ? maskApiKey(plain) : "解密失败",
        lastTestAt: r.lastTestAt,
        lastTestOk: r.lastTestOk,
        createdAt: r.createdAt,
      });
    }

    const grouped = [...byUser.values()];
    return c.json({ users: grouped, totalUsers: grouped.length, totalApis: rows.length });
  } catch (err) {
    console.error("[admin/byok]", err);
    return c.json({ error: "获取自带 API 列表失败" }, 500);
  }
});

// ── GET /api/admin/visitors ── 匿名访客来源（按 IP 聚合 request_logs 未登录请求）
adminRoutes.get("/visitors", async (c) => {
  const admin = await requireAdmin(c, "admin.users");
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();
    const days = Math.max(1, Math.min(90, Number(c.req.query("days")) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const rows = db
      .select({ ip: requestLogs.ip, userAgent: requestLogs.userAgent, timestamp: requestLogs.timestamp })
      .from(requestLogs)
      .where(and(isNull(requestLogs.userId), gte(requestLogs.timestamp, since)))
      .orderBy(asc(requestLogs.timestamp))
      .all();

    const map = new Map<string, {
      ip: string;
      visits: number;
      firstSeenAt: string;
      lastSeenAt: string;
      userAgent: string;
    }>();

    for (const r of rows) {
      const entry = map.get(r.ip);
      if (!entry) {
        map.set(r.ip, {
          ip: r.ip,
          visits: 1,
          firstSeenAt: r.timestamp,
          lastSeenAt: r.timestamp,
          userAgent: r.userAgent ?? "",
        });
      } else {
        entry.visits++;
        if (r.timestamp >= entry.lastSeenAt) {
          entry.lastSeenAt = r.timestamp;
          entry.userAgent = r.userAgent ?? "";
        }
      }
    }

    const visitors = [...map.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    const totalVisits = visitors.reduce((s, v) => s + v.visits, 0);

    return c.json({ visitors, totalIps: visitors.length, totalVisits, since });
  } catch (err) {
    console.error("[admin/visitors]", err);
    return c.json({ error: "获取访客来源失败" }, 500);
  }
});

// ── PUT /api/admin/users/:id/roles ── 授予/替换用户后台角色
adminRoutes.put("/users/:id/roles", async (c) => {
  const admin = await requireAdmin(c, "admin.permissions");
  if (!admin) return c.json({ error: "无权限" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const roleIds = Array.isArray(body?.roleIds) ? body.roleIds.map(String).filter(Boolean) : [];

  try {
    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1).all();
    if (!target) return c.json({ error: "用户不存在" }, 404);

    // 匿名用户不可授权（预建人员有 githubLogin 占位，可授权）
    if (!target.githubId && !target.authingSub && !target.githubLogin) {
      return c.json({ error: "匿名用户不可授权" }, 400);
    }

    try {
      await assertRoleGrantsAllowed(c, roleIds);
    } catch (err) {
      if (err instanceof GrantError) return c.json({ error: err.message }, err.status as 400 | 403);
      throw err;
    }

    await db.delete(userRoles).where(eq(userRoles.userId, id)).run();
    const now = new Date().toISOString();
    for (const roleId of roleIds) {
      await db
        .insert(userRoles)
        .values({ id: crypto.randomUUID(), userId: id, roleId, assignedBy: admin.id, createdAt: now })
        .run();
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("Admin assign roles error:", err);
    return c.json({ error: "授权角色失败" }, 500);
  }
});

// ── PUT /api/admin/users/:id/plan ── 授予/替换用户套餐
adminRoutes.put("/users/:id/plan", async (c) => {
  const admin = await requireAdmin(c, "admin.permissions");
  if (!admin) return c.json({ error: "无权限" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const planId = body?.planId != null && body.planId !== "" ? String(body.planId) : null;
  const expiresAt = body?.expiresAt != null && body.expiresAt !== "" ? String(body.expiresAt) : null;

  try {
    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1).all();
    if (!target) return c.json({ error: "用户不存在" }, 404);

    // 匿名用户不可授权（预建人员有 githubLogin 占位，可授权）
    if (!target.githubId && !target.authingSub && !target.githubLogin) {
      return c.json({ error: "匿名用户不可授权" }, 400);
    }

    // 清除套餐
    if (planId == null) {
      await db.delete(userPlans).where(eq(userPlans.userId, id)).run();
      return c.json({ ok: true });
    }

    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, planId)).limit(1).all();
    if (!plan) return c.json({ error: "套餐不存在" }, 400);

    const [existing] = await db.select().from(userPlans).where(eq(userPlans.userId, id)).limit(1).all();
    if (existing) {
      await db
        .update(userPlans)
        .set({ planId, expiresAt, assignedBy: admin.id })
        .where(eq(userPlans.userId, id))
        .run();
    } else {
      await db
        .insert(userPlans)
        .values({ id: crypto.randomUUID(), userId: id, planId, expiresAt, assignedBy: admin.id, createdAt: new Date().toISOString() })
        .run();
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("Admin assign plan error:", err);
    return c.json({ error: "授权套餐失败" }, 500);
  }
});

// ── GET /api/admin/traces ──
adminRoutes.get("/traces", async (c) => {
  const admin = await requireAdmin(c, "admin.traces");
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();

    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const pageSize = Math.min(Math.max(1, parseInt(c.req.query("pageSize") ?? "50", 10)), 200);

    const statusFilter = c.req.query("status") ?? undefined;
    const conversationIdFilter = c.req.query("conversationId") ?? undefined;
    const startDate = c.req.query("startDate") ?? undefined;
    const endDate = c.req.query("endDate") ?? undefined;

    const conditions = [];
    if (statusFilter) conditions.push(eq(aiTraces.status, statusFilter));
    if (conversationIdFilter) conditions.push(eq(aiTraces.conversationId, conversationIdFilter));
    if (startDate) conditions.push(gte(aiTraces.timestamp, startDate));
    if (endDate) conditions.push(lte(aiTraces.timestamp, endDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const allRows = await db
      .select()
      .from(aiTraces)
      .where(where)
      .orderBy(desc(aiTraces.timestamp))
      .all();

    const total = allRows.length;
    const offset = (page - 1) * pageSize;
    const rows = allRows.slice(offset, offset + pageSize);

    return c.json({ traces: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error("[admin/traces]", err);
    return c.json({ error: "获取 trace 列表失败" }, 500);
  }
});

// ── GET /api/admin/traces/:id ──
adminRoutes.get("/traces/:id", async (c) => {
  const admin = await requireAdmin(c, "admin.traces");
  if (!admin) return c.json({ error: "无权限" }, 403);

  const id = c.req.param("id");

  try {
    const db = getDb();

    const [trace] = await db.select().from(aiTraces).where(eq(aiTraces.id, id)).limit(1).all();
    if (!trace) return c.json({ error: "trace 不存在" }, 404);

    const spans = await db
      .select()
      .from(aiSpans)
      .where(eq(aiSpans.traceId, id))
      .orderBy(asc(aiSpans.timestamp))
      .all();

    const events = await db
      .select()
      .from(aiEvents)
      .where(eq(aiEvents.traceId, id))
      .orderBy(asc(aiEvents.timestamp))
      .all();

    return c.json({ trace, spans, events });
  } catch (err) {
    console.error("[admin/traces/detail]", err);
    return c.json({ error: "获取 trace 详情失败" }, 500);
  }
});

// ── GET /api/admin/degradations/stats ──
adminRoutes.get("/degradations/stats", async (c) => {
  const admin = await requireAdmin(c, "admin.traces");
  if (!admin) return c.json({ error: "无权限" }, 403);

  try {
    const db = getDb();

    const endDate = c.req.query("endDate") ?? new Date().toISOString();
    const startDate =
      c.req.query("startDate") ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const range = and(
      gte(aiEvents.timestamp, startDate),
      lte(aiEvents.timestamp, endDate),
    );

    const events = await db
      .select()
      .from(aiEvents)
      .where(and(eq(aiEvents.type, "degradation"), range))
      .all();

    // 按降级类型聚合
    const nameMap = new Map<string, number>();
    for (const e of events) {
      nameMap.set(e.name, (nameMap.get(e.name) ?? 0) + 1);
    }
    const byName = [...nameMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // 按天聚合
    const dayMap = new Map<string, number>();
    for (const e of events) {
      const day = e.timestamp.substring(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    const overTime = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    return c.json({ total: events.length, byName, overTime });
  } catch (err) {
    console.error("[admin/degradations/stats]", err);
    return c.json({ error: "获取降级统计失败" }, 500);
  }
});
