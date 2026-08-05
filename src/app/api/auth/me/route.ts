/**
 * GET /api/auth/me
 *
 * 返回当前登录用户信息。支持 Authing OIDC 和微信直接登录。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, getUserInfo, isAuthingConfigured } from "@/lib/auth/oidc";

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

  // 微信登录态：从 auth_user cookie 读取
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
        },
        isSignedIn: true,
      });
    } catch {
      // fall through to other methods
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
