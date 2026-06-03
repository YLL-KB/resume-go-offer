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

export async function GET(request: NextRequest) {
  if (!isAuthingConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=not_configured", request.url),
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    const errorDesc = searchParams.get("error_description") ?? error;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDesc)}`, request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=no_code", request.url),
    );
  }

  try {
    const host = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUri = `${host}/api/auth/callback`;

    const tokens = await exchangeCodeForToken(code, redirectUri);
    const user = await getUserInfo(tokens.access_token);

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    setSessionCookie(
      response.headers,
      tokens.access_token,
      tokens.id_token,
      tokens.expires_in,
    );

    response.headers.append(
      "Set-Cookie",
      `auth_user=${encodeURIComponent(JSON.stringify(user))}; Secure; SameSite=Lax; Path=/; Max-Age=${tokens.expires_in}`,
    );

    return response;
  } catch (err) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(
      new URL("/login?error=auth_failed", request.url),
    );
  }
}
