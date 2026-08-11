/**
 * GET /api/auth/github/authorize
 *
 * 生成 GitHub OAuth 授权 URL，设置 state cookie（CSRF 防护），重定向到 GitHub。
 */

import { NextRequest, NextResponse } from "next/server";
import { getGitHubAuthorizeUrl, setStateCookie, isGitHubConfigured } from "@/lib/auth/github";

function getBaseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);

  if (!isGitHubConfigured()) {
    return NextResponse.redirect(new URL("/login?error=github_not_configured", baseUrl));
  }

  const redirectUri = `${baseUrl}/api/auth/github/callback`;
  const state = crypto.randomUUID();
  const authorizeUrl = getGitHubAuthorizeUrl(redirectUri, state);

  const response = NextResponse.redirect(authorizeUrl);
  setStateCookie(response.headers, state);

  return response;
}
