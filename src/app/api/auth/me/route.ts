/**
 * GET /api/auth/me
 *
 * 返回当前登录用户信息。支持 Authing OIDC、微信、GitHub 三种登录方式。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, getUserInfo, isAuthingConfigured } from "@/lib/auth/oidc";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) result[key] = rest.join("=");
  }
  return result;
}

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("Cookie");
  const cookies = cookieHeader ? parseCookies(cookieHeader) : {};

  // 从 auth_user cookie 读取（微信 / GitHub 登录均写入此 cookie）
  const authUserRaw = cookies["auth_user"];
  if (authUserRaw) {
    try {
      const user = JSON.parse(decodeURIComponent(authUserRaw));
      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name ?? "微信用户",
          email: user.email ?? null,
          avatarUrl: user.avatarUrl ?? null,
          phone: user.phone ?? null,
          wechatOpenid: user.wechatOpenid ?? null,
          githubId: user.githubId ?? null,
          githubLogin: user.githubLogin ?? null,
        },
        isSignedIn: true,
      });
    } catch {
      // fall through to other methods
    }
  }

  // 尝试从 auth_session 恢复 GitHub 用户（auth_user cookie 可能丢失）
  const authSessionRaw = cookies["auth_session"];
  if (authSessionRaw) {
    try {
      const session = JSON.parse(decodeURIComponent(authSessionRaw));
      if (session.provider === "github") {
        const db = getDb();
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.githubId, session.githubId))
          .limit(1);
        if (rows.length > 0) {
          const u = rows[0];
          return NextResponse.json({
            user: {
              id: u.id,
              name: u.name,
              email: u.email,
              avatarUrl: u.avatarUrl,
              githubId: u.githubId,
              githubLogin: u.githubLogin,
            },
            isSignedIn: true,
          });
        }
      }
    } catch {
      // fall through
    }
  }

  // Authing 登录态
  if (!isAuthingConfigured()) {
    return NextResponse.json({ user: null, isSignedIn: false });
  }

  const session = getSessionFromCookie(request);
  if (!session) {
    return NextResponse.json({ user: null, isSignedIn: false });
  }

  try {
    const user = await getUserInfo(session.accessToken);
    return NextResponse.json({
      user: {
        id: user.sub,
        name: user.name ?? user.username ?? "未命名用户",
        email: user.email ?? null,
        avatarUrl: user.picture ?? null,
        phone: user.phone_number ?? null,
        wechatOpenid: user.wechat_openid ?? null,
        alipayUserId: user.alipay_user_id ?? null,
      },
      isSignedIn: true,
    });
  } catch {
    return NextResponse.json({ user: null, isSignedIn: false }, { status: 401 });
  }
}
