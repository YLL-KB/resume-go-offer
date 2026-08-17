/**
 * Admin 鉴权 — 超级管理员白名单 + 数据库角色（RBAC）
 *
 * 超级管理员：环境变量 ADMIN_GITHUB_IDS 逗号分隔多个管理员 GitHub ID，
 * 命中即拥有全部权限（通配 `*`），用于 bootstrap 防止锁死。
 *
 * 普通后台用户：通过 user_roles ↔ roles 表授予细粒度权限点，
 * 由后台「权限管理」页维护。
 */

import { getUser } from "./index";
import type { User } from "./types";
import { getDb } from "../../db";
import { roles, userRoles } from "../../db/schema";
import { eq, inArray } from "drizzle-orm";
import { WILDCARD } from "./permissions";

export interface AdminUser {
  id: string;
  name: string | null;
  githubId: string | null;
  githubLogin: string | null;
  avatarUrl: string | null;
}

function getAdminIds(): Set<string> {
  const raw = process.env.ADMIN_GITHUB_IDS ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

/** 超级管理员（env 白名单 或 本地 dev mock） */
function isSuperAdmin(user: User): boolean {
  if (process.env.NODE_ENV === "development" && user.githubId === "00000000") {
    return true;
  }
  const ids = getAdminIds();
  return ids.size > 0 && !!user.githubId && ids.has(user.githubId);
}

function toAdminUser(user: User): AdminUser {
  return {
    id: user.id,
    name: user.name ?? null,
    githubId: user.githubId ?? null,
    githubLogin: user.githubLogin ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/** 当前请求用户是否为后台用户（超级管理员 或 拥有任一 DB 角色） */
export async function getAdminUser(request: Request): Promise<AdminUser | null> {
  const user = await getUser(request);
  if (!user) return null;

  if (isSuperAdmin(user)) return toAdminUser(user);

  const db = getDb();
  const rows = db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id))
    .limit(1)
    .all();
  if (rows.length === 0) return null;

  return toAdminUser(user);
}

/**
 * 当前请求用户的权限点集合。
 * - 非后台用户 → null
 * - 超级管理员 → Set(["*"])（通配全量）
 * - 普通后台用户 → 各角色 permissions 的并集
 */
export async function getAdminPermissions(request: Request): Promise<Set<string> | null> {
  const user = await getUser(request);
  if (!user) return null;

  if (isSuperAdmin(user)) return new Set([WILDCARD]);

  const db = getDb();
  const roleRows = db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id))
    .all();
  if (roleRows.length === 0) return null;

  const roleIds = roleRows.map((r) => r.roleId);
  const roleDefs = db
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(inArray(roles.id, roleIds))
    .all();

  const perms = new Set<string>();
  for (const r of roleDefs) {
    let list: string[];
    try {
      list = JSON.parse(r.permissions);
    } catch {
      list = [];
    }
    for (const p of list) perms.add(p);
  }
  return perms;
}

/** 判断当前请求是否拥有指定权限点（`*` 视为拥有所有） */
export async function requirePermission(request: Request, key: string): Promise<boolean> {
  const perms = await getAdminPermissions(request);
  if (!perms) return false;
  if (perms.has(WILDCARD)) return true;
  return perms.has(key);
}
