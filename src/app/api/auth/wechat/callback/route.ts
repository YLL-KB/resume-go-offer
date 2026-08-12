/**
 * GET /api/auth/wechat/callback
 *
 * 微信扫码登录回调。用 authorization code 换取 access_token，
 * 获取微信用户信息，写入 cookie 并重定向到聊天页。
 */

import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import {
  exchangeWechatCode,
  getWechatUserInfo,
  isWechatConfigured,
} from "@/lib/auth/wechat";

function getBaseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export const GET = withRequestLog(async (request: NextRequest) => {
  const baseUrl = getBaseUrl(request);

  if (!isWechatConfigured()) {
    return NextResponse.redirect(new URL("/login?error=wechat_not_configured", baseUrl));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    const errorDesc = searchParams.get("error_description") ?? error;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDesc)}`, baseUrl),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", baseUrl));
  }

  try {
    const token = await exchangeWechatCode(code);
    const wxUser = await getWechatUserInfo(token.access_token, token.openid);

    // 转为应用内部 User 格式
    const appUser = {
      id: wxUser.unionid ?? wxUser.openid,
      name: wxUser.nickname,
      email: null as string | null,
      avatarUrl: wxUser.headimgurl,
      phone: null as string | null,
      wechatOpenid: wxUser.openid,
      wechatUnionid: wxUser.unionid ?? null,
    };

    const maxAge = token.expires_in;

    // 服务端 session cookie（HttpOnly）
    const sessionValue = JSON.stringify({
      provider: "wechat" as const,
      accessToken: token.access_token,
      openid: wxUser.openid,
    });

    const response = NextResponse.redirect(new URL("/chat", baseUrl));
    response.headers.append(
      "Set-Cookie",
      `auth_session=${encodeURIComponent(sessionValue)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    response.headers.append(
      "Set-Cookie",
      `auth_user=${encodeURIComponent(JSON.stringify(appUser))}; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );

    return response;
  } catch (err) {
    console.error("WeChat callback error:", err);
    return NextResponse.redirect(new URL("/login?error=wechat_auth_failed", baseUrl));
  }
});
