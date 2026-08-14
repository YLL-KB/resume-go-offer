/**
 * 共享鉴权工具 — 统一用户身份解析
 *
 * 所有 API 路由通过 getAuthUserId 获取当前请求的用户 ID，
 * 避免身份解析逻辑散落各处导致不一致。
 */

import { getUser } from "./index";

export const ANON_COOKIE = "anon_id";

export interface AuthUserId {
  userId: string;
  isAnonymous: boolean;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) result[key] = rest.join("=");
  }
  return result;
}

/** 从 anon_id cookie 读取或生成新的匿名 ID */
function getAnonymousId(request: Request): string {
  const cookieHeader = request.headers.get("Cookie");
  const cookies = cookieHeader ? parseCookies(cookieHeader) : {};
  const cookieId = cookies[ANON_COOKIE];
  if (cookieId) return cookieId;
  return `anon-${crypto.randomUUID()}`;
}

/**
 * 解析当前请求的用户 ID
 *
 * - 已登录：返回 Authing 用户 ID（isAnonymous = false）
 * - 未登录：返回匿名 ID（优先从 anon_id cookie 读，保证跨请求稳定）
 */
export async function getAuthUserId(request: Request): Promise<AuthUserId> {
  const authUser = await getUser(request);
  if (authUser?.id) {
    return { userId: authUser.id, isAnonymous: false };
  }
  return { userId: getAnonymousId(request), isAnonymous: true };
}

/** 生成 anon_id cookie 字符串（仅对匿名用户调用） */
export function buildAnonymousCookie(anonId: string): string {
  return `${ANON_COOKIE}=${anonId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 365}`;
}
