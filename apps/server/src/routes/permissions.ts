/**
 * 权限管理路由 — 后台角色（RBAC）与套餐（Plan/收费地基）的 CRUD + 目录。
 *
 * 挂载于 /api/admin/permissions，所有接口需 `admin.permissions` 权限。
 * 用户授权（角色/套餐）接口在 admin.ts 的 /users/:id 下。
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getDb } from "../db";
import { roles, userRoles, plans, userPlans } from "../db/schema";
import { requirePermission } from "../lib/auth/admin";
import { ADMIN_PERMISSIONS, FEATURE_FLAGS, WILDCARD } from "../lib/auth/permissions";
import { eq, asc } from "drizzle-orm";

export const permissionsRoutes = new Hono();

const NAME_RE = /^[a-z0-9_-]+$/;

function parseJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 权限点白名单校验：只允许 ADMIN_PERMISSIONS 目录中的 key。
 * 通配 "*" 是内置超级管理员的专属权限，任何角色 CRUD 都不得授予——
 * 否则可创建全权限角色并授给自己，造成权限提升漏洞。
 */
function sanitizePermissions(list: unknown): { ok: true; permissions: string[] } | { ok: false; error: string } {
  if (!Array.isArray(list)) return { ok: false, error: "permissions 必须是数组" };
  const valid = new Set(ADMIN_PERMISSIONS.map((p) => p.key));
  const result: string[] = [];
  for (const item of list) {
    const key = String(item);
    if (key === WILDCARD) return { ok: false, error: "不允许授予通配权限 *" };
    if (!valid.has(key)) return { ok: false, error: `非法权限点：${key}` };
    if (!result.includes(key)) result.push(key);
  }
  return { ok: true, permissions: result };
}

async function canManage(c: Context): Promise<boolean> {
  return requirePermission(c.req.raw, "admin.permissions");
}

// ── GET /api/admin/permissions/meta ──
permissionsRoutes.get("/meta", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  return c.json({ adminPermissions: ADMIN_PERMISSIONS, featureFlags: FEATURE_FLAGS });
});

// ── 角色 CRUD ──

permissionsRoutes.get("/roles", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const db = getDb();
  const rows = db.select().from(roles).orderBy(asc(roles.createdAt)).all();
  return c.json({
    roles: rows.map((r) => ({ ...r, permissions: parseJsonArray(r.permissions) })),
  });
});

permissionsRoutes.post("/roles", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const label = String(body?.label ?? "").trim();

  if (!name || !label) return c.json({ error: "角色名和显示名不能为空" }, 400);
  if (!NAME_RE.test(name)) return c.json({ error: "角色名只能包含小写字母、数字、下划线、连字符" }, 400);

  const sanitized = sanitizePermissions(body?.permissions ?? []);
  if (!sanitized.ok) return c.json({ error: sanitized.error }, 400);
  const permissions = sanitized.permissions;

  const db = getDb();
  const dup = db.select().from(roles).where(eq(roles.name, name)).all();
  if (dup.length > 0) return c.json({ error: "角色名已存在" }, 409);

  const now = new Date().toISOString();
  db.insert(roles)
    .values({
      id: crypto.randomUUID(),
      name,
      label,
      permissions: JSON.stringify(permissions),
      isBuiltin: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return c.json({ ok: true });
});

permissionsRoutes.put("/roles/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  const db = getDb();
  const [role] = db.select().from(roles).where(eq(roles.id, id)).limit(1).all();
  if (!role) return c.json({ error: "角色不存在" }, 404);

  const label = body?.label !== undefined ? String(body.label).trim() : role.label;
  // 内置角色不可改 name
  const name = role.isBuiltin
    ? role.name
    : body?.name !== undefined
      ? String(body.name).trim()
      : role.name;

  if (!name || !label) return c.json({ error: "角色名和显示名不能为空" }, 400);
  if (!NAME_RE.test(name)) return c.json({ error: "角色名只能包含小写字母、数字、下划线、连字符" }, 400);

  // 内置角色的权限点是安全边界（super_admin 的通配 / admin 的基础权限），禁止修改；
  // 若请求带上了不同的 permissions，明确报错而不是静默忽略，避免前端误以为保存成功
  let permissions = parseJsonArray(role.permissions);
  if (body?.permissions !== undefined) {
    if (role.isBuiltin) {
      const incoming = sanitizePermissions(body.permissions);
      const incomingList = incoming.ok ? incoming.permissions : [];
      const same =
        incomingList.length === permissions.length &&
        incomingList.every((p) => permissions.includes(p));
      if (!same) {
        return c.json({ error: "内置角色的权限不可修改" }, 400);
      }
    } else {
      const sanitized = sanitizePermissions(body.permissions);
      if (!sanitized.ok) return c.json({ error: sanitized.error }, 400);
      permissions = sanitized.permissions;
    }
  }

  if (name !== role.name) {
    const dup = db.select().from(roles).where(eq(roles.name, name)).all();
    if (dup.length > 0) return c.json({ error: "角色名已存在" }, 409);
  }

  db.update(roles)
    .set({ name, label, permissions: JSON.stringify(permissions), updatedAt: new Date().toISOString() })
    .where(eq(roles.id, id))
    .run();
  return c.json({ ok: true });
});

permissionsRoutes.delete("/roles/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const id = c.req.param("id");

  const db = getDb();
  const [role] = db.select().from(roles).where(eq(roles.id, id)).limit(1).all();
  if (!role) return c.json({ error: "角色不存在" }, 404);
  if (role.isBuiltin) return c.json({ error: "内置角色不可删除" }, 400);

  const refs = db.select().from(userRoles).where(eq(userRoles.roleId, id)).all();
  if (refs.length > 0) return c.json({ error: "该角色已授予用户，无法删除" }, 400);

  db.delete(roles).where(eq(roles.id, id)).run();
  return c.json({ ok: true });
});

// ── 套餐 CRUD ──

permissionsRoutes.get("/plans", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const db = getDb();
  const rows = db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.createdAt)).all();
  return c.json({
    plans: rows.map((p) => ({ ...p, features: parseJsonArray(p.features) })),
  });
});

permissionsRoutes.post("/plans", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const label = String(body?.label ?? "").trim();
  const features = Array.isArray(body?.features) ? body.features.map(String) : [];
  const priceCents = body?.priceCents != null && body.priceCents !== "" ? Number(body.priceCents) : null;
  const sortOrder = body?.sortOrder != null ? Number(body.sortOrder) || 0 : 0;

  if (!name || !label) return c.json({ error: "套餐名和显示名不能为空" }, 400);
  if (!NAME_RE.test(name)) return c.json({ error: "套餐名只能包含小写字母、数字、下划线、连字符" }, 400);

  const db = getDb();
  const dup = db.select().from(plans).where(eq(plans.name, name)).all();
  if (dup.length > 0) return c.json({ error: "套餐名已存在" }, 409);

  const now = new Date().toISOString();
  db.insert(plans)
    .values({
      id: crypto.randomUUID(),
      name,
      label,
      features: JSON.stringify(features),
      priceCents,
      sortOrder,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return c.json({ ok: true });
});

permissionsRoutes.put("/plans/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  const db = getDb();
  const [plan] = db.select().from(plans).where(eq(plans.id, id)).limit(1).all();
  if (!plan) return c.json({ error: "套餐不存在" }, 404);

  const name = body?.name !== undefined ? String(body.name).trim() : plan.name;
  const label = body?.label !== undefined ? String(body.label).trim() : plan.label;
  const features = Array.isArray(body?.features) ? body.features.map(String) : parseJsonArray(plan.features);
  const priceCents = body?.priceCents != null && body.priceCents !== "" ? Number(body.priceCents) : null;
  const sortOrder = body?.sortOrder != null ? Number(body.sortOrder) || 0 : plan.sortOrder;
  const isActive = body?.isActive != null ? (body.isActive ? 1 : 0) : plan.isActive;

  if (!name || !label) return c.json({ error: "套餐名和显示名不能为空" }, 400);
  if (!NAME_RE.test(name)) return c.json({ error: "套餐名只能包含小写字母、数字、下划线、连字符" }, 400);

  if (name !== plan.name) {
    const dup = db.select().from(plans).where(eq(plans.name, name)).all();
    if (dup.length > 0) return c.json({ error: "套餐名已存在" }, 409);
  }

  db.update(plans)
    .set({
      name,
      label,
      features: JSON.stringify(features),
      priceCents,
      sortOrder,
      isActive,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(plans.id, id))
    .run();
  return c.json({ ok: true });
});

permissionsRoutes.delete("/plans/:id", async (c) => {
  if (!(await canManage(c))) return c.json({ error: "无权限" }, 403);
  const id = c.req.param("id");

  const db = getDb();
  const [plan] = db.select().from(plans).where(eq(plans.id, id)).limit(1).all();
  if (!plan) return c.json({ error: "套餐不存在" }, 404);

  const refs = db.select().from(userPlans).where(eq(userPlans.planId, id)).all();
  if (refs.length > 0) return c.json({ error: "该套餐已分配给用户，无法删除" }, 400);

  db.delete(plans).where(eq(plans.id, id)).run();
  return c.json({ ok: true });
});
