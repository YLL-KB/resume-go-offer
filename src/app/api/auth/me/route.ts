/**
 * GET /api/auth/me
 *
 * 返回当前登录用户信息。未登录返回未认证状态。
 * Authing 未配置时同样返回未登录状态（不抛错）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, getUserInfo, isAuthingConfigured } from "@/lib/auth/oidc";

export async function GET(request: NextRequest) {
  // 未配置 Authing → 静默返回未登录
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
