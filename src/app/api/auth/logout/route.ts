/**
 * GET /api/auth/logout
 *
 * 清除 session cookie，重定向到首页。
 */

import { NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { clearSessionCookie } from "@/lib/auth/oidc";

export const GET = withRequestLog(async () => {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/", host));

  clearSessionCookie(response.headers);

  // 同时清除用户信息 cookie
  response.headers.append(
    "Set-Cookie",
    "auth_user=; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );

  return response;
});
