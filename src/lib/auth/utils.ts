/**
 * 共享鉴权工具 — 统一用户身份解析
 *
 * 所有 API 路由通过 getAuthUserId 获取当前请求的用户 ID，
 * 避免身份解析逻辑散落各处导致不一致。
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "./index";

export const ANON_COOKIE = "anon_id";

export interface AuthUserId {
  userId: string;
  isAnonymous: boolean;
}

/** 从 anon_id cookie 读取或生成新的匿名 ID */
function getAnonymousId(request: NextRequest): string {
  const cookieId = request.cookies.get(ANON_COOKIE)?.value;
  if (cookieId) return cookieId;
  return `anon-${crypto.randomUUID()}`;
}

/**
 * 解析当前请求的用户 ID
 *
 * - 已登录：返回 Authing 用户 ID（isAnonymous = false）
 * - 未登录：返回匿名 ID（优先从 anon_id cookie 读，保证跨请求稳定）
 */
export async function getAuthUserId(request: NextRequest): Promise<AuthUserId> {
  const authUser = await getUser(request);
  if (authUser?.id) {
    return { userId: authUser.id, isAnonymous: false };
  }
  return { userId: getAnonymousId(request), isAnonymous: true };
}

/** 在响应中设置 anon_id cookie（仅对匿名用户调用） */
export function setAnonymousCookie(
  response: NextResponse,
  anonId: string,
) {
  response.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 年
  });
}
