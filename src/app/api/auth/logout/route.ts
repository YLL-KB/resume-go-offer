/**
 * GET /api/auth/logout
 *
 * 清除 session cookie，重定向到首页。
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/oidc";

export async function GET() {
  const response = NextResponse.redirect(new URL("/", "http://localhost:3000"));

  clearSessionCookie(response.headers);

  // 同时清除用户信息 cookie
  response.headers.append(
    "Set-Cookie",
    "auth_user=; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );

  return response;
}
