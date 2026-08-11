/**
 * Admin 鉴权 — 白名单 GitHub ID 校验
 *
 * 环境变量 ADMIN_GITHUB_IDS 逗号分隔多个管理员 GitHub ID。
 * 不设置则无人可访问管理后台。
 */

import { getUser } from "./index";

export interface AdminUser {
  id: string;
  name: string | null;
  githubId: string;
  githubLogin: string | null;
  avatarUrl: string | null;
}

function getAdminIds(): Set<string> {
  const raw = process.env.ADMIN_GITHUB_IDS ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export async function getAdminUser(request: Request): Promise<AdminUser | null> {
  const ids = getAdminIds();
  if (ids.size === 0) return null;

  const user = await getUser(request);
  if (!user?.githubId || !ids.has(user.githubId)) return null;

  return {
    id: user.id,
    name: user.name ?? null,
    githubId: user.githubId,
    githubLogin: user.githubLogin ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}
