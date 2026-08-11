/**
 * GET /api/auth/github/callback
 *
 * GitHub OAuth 回调。验证 state → 换 token → 获取用户信息 →
 * 持久化到 DB → 写入 cookie → 重定向到聊天页。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGitHubCode,
  getGitHubUser,
  getGitHubEmails,
  getStateFromCookie,
  clearStateCookie,
  isGitHubConfigured,
} from "@/lib/auth/github";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");

  if (error) {
    const errorDesc = searchParams.get("error_description") ?? error;
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDesc)}`, baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", baseUrl));
  }

  // CSRF 验证
  const savedState = getStateFromCookie(request);
  if (!savedState || savedState !== returnedState) {
    return NextResponse.redirect(new URL("/login?error=state_mismatch", baseUrl));
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/github/callback`;

    // 1. 换 token
    const token = await exchangeGitHubCode(code, redirectUri);

    // 2. 获取用户信息
    const ghUser = await getGitHubUser(token.access_token);

    // 3. 如果 user endpoint 没有 email，从 emails endpoint 获取
    let email = ghUser.email;
    if (!email) {
      try {
        const emails = await getGitHubEmails(token.access_token);
        const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
        email = primary?.email ?? null;
      } catch {
        // email 非必需
      }
    }

    // 4. 持久化用户到 DB
    const db = getDb();
    const githubId = String(ghUser.id);
    const now = new Date().toISOString();

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.githubId, githubId))
      .limit(1);

    let userId: string;

    if (existing.length > 0) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({
          githubLogin: ghUser.login,
          name: ghUser.name ?? existing[0].name,
          email: email ?? existing[0].email,
          avatarUrl: ghUser.avatar_url ?? existing[0].avatarUrl,
          updatedAt: now,
        })
        .where(eq(users.githubId, githubId));
    } else {
      userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        githubId,
        githubLogin: ghUser.login,
        name: ghUser.name ?? ghUser.login,
        email,
        avatarUrl: ghUser.avatar_url,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 5. 构建应用内 User 对象
    const appUser = {
      id: userId,
      name: ghUser.name ?? ghUser.login,
      email,
      avatarUrl: ghUser.avatar_url,
      githubId,
      githubLogin: ghUser.login,
    };

    // 6. 设置 cookie 并重定向
    const sessionValue = JSON.stringify({
      provider: "github" as const,
      accessToken: token.access_token,
      githubId,
    });

    const maxAge = 60 * 60 * 24 * 30; // 30 天

    const response = NextResponse.redirect(new URL("/chat", baseUrl));
    response.headers.append(
      "Set-Cookie",
      `auth_session=${encodeURIComponent(sessionValue)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    response.headers.append(
      "Set-Cookie",
      `auth_user=${encodeURIComponent(JSON.stringify(appUser))}; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    clearStateCookie(response.headers);

    return response;
  } catch (err) {
    console.error("GitHub callback error:", err);
    const message = err instanceof Error ? err.message : "github_auth_failed";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, baseUrl));
  }
}
