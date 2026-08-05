/**
 * GET /api/auth/callback
 *
 * Authing 登录成功后的回调地址。
 * 处理 OIDC authorization code flow。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  getUserInfo,
  setSessionCookie,
  isAuthingConfigured,
} from "@/lib/auth/oidc";

/** 优先用环境变量，回退到请求中的 Host 头推导 */
function getBaseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);

  if (!isAuthingConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=not_configured", baseUrl),
    );
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
    return NextResponse.redirect(
      new URL("/login?error=no_code", baseUrl),
    );
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/callback`;

    const tokens = await exchangeCodeForToken(code, redirectUri);
    const user = await getUserInfo(tokens.access_token);

    const response = NextResponse.redirect(new URL("/chat", baseUrl));
    setSessionCookie(
      response.headers,
      tokens.access_token,
      tokens.id_token,
      tokens.expires_in,
    );

    // 转换为应用内部 User 格式（Authing 原始字段是 sub/picture）
    const appUser = {
      id: user.sub,
      name: user.name ?? user.username ?? null,
      email: user.email ?? null,
      avatarUrl: user.picture ?? null,
      phone: user.phone_number ?? null,
      wechatOpenid: user.wechat_openid ?? null,
      alipayUserId: user.alipay_user_id ?? null,
    };
    response.headers.append(
      "Set-Cookie",
      `auth_user=${encodeURIComponent(JSON.stringify(appUser))}; Secure; SameSite=Lax; Path=/; Max-Age=${tokens.expires_in}`,
    );

    return response;
  } catch (err) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(
      new URL("/login?error=auth_failed", baseUrl),
    );
  }
}
