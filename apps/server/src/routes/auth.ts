/**
 * 认证相关路由 — Authing OIDC / GitHub / 微信 三种登录方式。
 *
 * 路径与原 Next.js 单体一致（/api/auth/*），通过前端反向代理转发。
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import {
  getAuthorizationUrl,
  isAuthingConfigured,
  exchangeCodeForToken,
  getUserInfo,
  setSessionCookie,
  getSessionFromCookie,
  clearSessionCookie,
} from "../lib/auth/oidc";
import {
  getGitHubAuthorizeUrl,
  setStateCookie,
  getStateFromCookie,
  clearStateCookie,
  exchangeGitHubCode,
  getGitHubUser,
  getGitHubEmails,
  isGitHubConfigured,
  isDevEnv,
} from "../lib/auth/github";
import {
  getWechatLoginUrl,
  isWechatConfigured,
  exchangeWechatCode,
  getWechatUserInfo,
} from "../lib/auth/wechat";

export const auth = new Hono();

/** 优先用环境变量，回退到请求中的 Host 头推导 */
function getBaseUrl(c: Context): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const proto = c.req.header("x-forwarded-proto") ?? "https";
  const host =
    c.req.header("x-forwarded-host") ??
    c.req.header("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}

function redirectWithCookies(url: string, headers: Headers): Response {
  headers.set("Location", url);
  return new Response(null, { status: 302, headers });
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) result[key] = rest.join("=");
  }
  return result;
}

// ── GET /api/auth/login ──
auth.get("/login", (c) => {
  if (!isAuthingConfigured()) {
    return c.html(CONFIG_GUIDE_HTML);
  }

  const host = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${host}/api/auth/callback`;
  const loginUrl = getAuthorizationUrl(redirectUri);
  return c.redirect(loginUrl);
});

// ── GET /api/auth/callback ──
auth.get("/callback", async (c) => {
  const baseUrl = getBaseUrl(c);

  if (!isAuthingConfigured()) {
    return c.redirect(`${baseUrl}/login?error=not_configured`);
  }

  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    const errorDesc = c.req.query("error_description") ?? error;
    return c.redirect(`${baseUrl}/login?error=${encodeURIComponent(errorDesc)}`);
  }

  if (!code) {
    return c.redirect(`${baseUrl}/login?error=no_code`);
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/callback`;

    const tokens = await exchangeCodeForToken(code, redirectUri);
    const user = await getUserInfo(tokens.access_token);

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

    const headers = new Headers();
    setSessionCookie(headers, tokens.access_token, tokens.id_token, tokens.expires_in);
    headers.append(
      "Set-Cookie",
      `auth_user=${encodeURIComponent(JSON.stringify(appUser))}; Secure; SameSite=Lax; Path=/; Max-Age=${tokens.expires_in}`,
    );

    return redirectWithCookies(`${baseUrl}/`, headers);
  } catch (err) {
    console.error("Auth callback error:", err);
    return c.redirect(`${baseUrl}/login?error=auth_failed`);
  }
});

// ── GET /api/auth/me ──
auth.get("/me", async (c) => {
  const cookieHeader = c.req.header("Cookie");
  const cookies = cookieHeader ? parseCookies(cookieHeader) : {};

  // 从 auth_user cookie 读取（微信 / GitHub 登录均写入此 cookie）
  const authUserRaw = cookies["auth_user"];
  if (authUserRaw) {
    try {
      const user = JSON.parse(decodeURIComponent(authUserRaw));
      return c.json({
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
          return c.json({
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

  // 本地开发：无任何登录态时返回 mock 用户，免登录
  if (process.env.NODE_ENV === "development") {
    return c.json({
      user: {
        id: "dev-user-001",
        name: "Dev User",
        email: "dev@localhost",
        avatarUrl: null,
        githubId: "00000000",
        githubLogin: "dev",
      },
      isSignedIn: true,
    });
  }

  // Authing 登录态
  if (!isAuthingConfigured()) {
    return c.json({ user: null, isSignedIn: false });
  }

  const session = getSessionFromCookie(c.req.raw);
  if (!session) {
    return c.json({ user: null, isSignedIn: false });
  }

  try {
    const user = await getUserInfo(session.accessToken);
    return c.json({
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
    return c.json({ user: null, isSignedIn: false }, 401);
  }
});

// ── GET /api/auth/logout ──
auth.get("/logout", (c) => {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const headers = new Headers();
  clearSessionCookie(headers);
  headers.append("Set-Cookie", "auth_user=; Secure; SameSite=Lax; Path=/; Max-Age=0");

  return redirectWithCookies(`${host}/`, headers);
});

// ── GET /api/auth/github/authorize ──
auth.get("/github/authorize", (c) => {
  const baseUrl = getBaseUrl(c);

  if (!isGitHubConfigured()) {
    return c.redirect(`${baseUrl}/login?error=github_not_configured`);
  }

  const redirectUri = `${baseUrl}/api/auth/github/callback`;
  const state = crypto.randomUUID();
  const authorizeUrl = getGitHubAuthorizeUrl(redirectUri, state);

  const headers = new Headers();
  setStateCookie(headers, state);
  return redirectWithCookies(authorizeUrl, headers);
});

// ── GET /api/auth/github/callback ──
auth.get("/github/callback", async (c) => {
  const baseUrl = getBaseUrl(c);

  if (!isGitHubConfigured()) {
    return c.redirect(`${baseUrl}/login?error=github_not_configured`);
  }

  const code = c.req.query("code");
  const error = c.req.query("error");
  const returnedState = c.req.query("state");

  if (error) {
    const errorDesc = c.req.query("error_description") ?? error;
    return c.redirect(`${baseUrl}/login?error=${encodeURIComponent(errorDesc)}`);
  }

  if (!code) {
    return c.redirect(`${baseUrl}/login?error=no_code`);
  }

  // CSRF 验证
  const savedState = getStateFromCookie(c.req.raw);
  if (!savedState || savedState !== returnedState) {
    return c.redirect(`${baseUrl}/login?error=state_mismatch`);
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/github/callback`;

    const token = await exchangeGitHubCode(code, redirectUri);
    const ghUser = await getGitHubUser(token.access_token);

    let email = ghUser.email;
    if (!email) {
      try {
        const emails = await getGitHubEmails(token.access_token);
        const primary =
          emails.find((e) => e.primary && e.verified) ??
          emails.find((e) => e.verified);
        email = primary?.email ?? null;
      } catch {
        // email 非必需
      }
    }

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

    const appUser = {
      id: userId,
      name: ghUser.name ?? ghUser.login,
      email,
      avatarUrl: ghUser.avatar_url,
      githubId,
      githubLogin: ghUser.login,
    };

    const sessionValue = JSON.stringify({
      provider: "github" as const,
      accessToken: token.access_token,
      githubId,
    });

    const maxAge = 60 * 60 * 24 * 30; // 30 天
    const secure = isDevEnv() ? "" : "; Secure";

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `auth_session=${encodeURIComponent(sessionValue)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    headers.append(
      "Set-Cookie",
      `auth_user=${encodeURIComponent(JSON.stringify(appUser))}${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    clearStateCookie(headers);

    return redirectWithCookies(`${baseUrl}/`, headers);
  } catch (err) {
    console.error("GitHub callback error:", err);
    const message = err instanceof Error ? err.message : "github_auth_failed";
    return c.redirect(`${baseUrl}/login?error=${encodeURIComponent(message)}`);
  }
});

// ── GET /api/auth/wechat/login ──
auth.get("/wechat/login", (c) => {
  if (!isWechatConfigured()) {
    return c.html(
      '<html><body style="padding:40px;font-family:sans-serif"><h2>微信登录未配置</h2><p>请设置环境变量 <code>WECHAT_APP_ID</code> 和 <code>WECHAT_APP_SECRET</code></p></body></html>',
    );
  }

  const host = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${host}/api/auth/wechat/callback`;
  const url = getWechatLoginUrl(redirectUri);
  return c.redirect(url);
});

// ── GET /api/auth/wechat/callback ──
auth.get("/wechat/callback", async (c) => {
  const baseUrl = getBaseUrl(c);

  if (!isWechatConfigured()) {
    return c.redirect(`${baseUrl}/login?error=wechat_not_configured`);
  }

  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    const errorDesc = c.req.query("error_description") ?? error;
    return c.redirect(`${baseUrl}/login?error=${encodeURIComponent(errorDesc)}`);
  }

  if (!code) {
    return c.redirect(`${baseUrl}/login?error=no_code`);
  }

  try {
    const token = await exchangeWechatCode(code);
    const wxUser = await getWechatUserInfo(token.access_token, token.openid);

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

    const sessionValue = JSON.stringify({
      provider: "wechat" as const,
      accessToken: token.access_token,
      openid: wxUser.openid,
    });

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `auth_session=${encodeURIComponent(sessionValue)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    headers.append(
      "Set-Cookie",
      `auth_user=${encodeURIComponent(JSON.stringify(appUser))}; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );

    return redirectWithCookies(`${baseUrl}/`, headers);
  } catch (err) {
    console.error("WeChat callback error:", err);
    return c.redirect(`${baseUrl}/login?error=wechat_auth_failed`);
  }
});

const CONFIG_GUIDE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authing 未配置 — Resume Go Offer</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0; background: #fafafa; color: #333;
    }
    .card {
      background: #fff; border-radius: 12px; padding: 40px;
      max-width: 520px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      line-height: 1.7;
    }
    h2 { margin-top: 0; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    ol { padding-left: 20px; }
    li { margin-bottom: 8px; }
    a { color: #5468ff; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🔧 Authing 尚未配置</h2>
    <p>在开始使用登录功能前，需要先完成 Authing 接入配置：</p>
    <ol>
      <li>前往 <a href="https://console.authing.cn" target="_blank">Authing 控制台</a> 注册并创建应用</li>
      <li>在「登录控制」中启用 微信 / 支付宝 / 手机号验证码 等登录方式</li>
      <li>设置回调地址为 <code>http://localhost:3000/api/auth/callback</code></li>
      <li>将以下环境变量填入 <code>.env.local</code>：
        <ul>
          <li><code>AUTHING_APP_ID</code> = 应用 ID</li>
          <li><code>AUTHING_APP_SECRET</code> = 应用密钥</li>
          <li><code>AUTHING_ISSUER</code> = https://你的应用.authing.cn</li>
        </ul>
      </li>
      <li>重启 <code>npm run dev</code> 即可生效</li>
    </ol>
  </div>
</body>
</html>`;
