/**
 * GitHub OAuth 登录工具
 *
 * 文档：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 *
 * 环境自动切换：
 *   - 本地开发（NODE_ENV=development 或 localhost）→ 优先用 GITHUB_CLIENT_ID_DEV / GITHUB_CLIENT_SECRET_DEV
 *   - 生产环境 → 用 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
 */

import https from "https";

// ── 自定义 fetch：使用 https 模块（HTTP/1.1）+ 重试 ──
// Node.js 内置 fetch (undici) 的 HTTP/2 从中国 VPS 访问 GitHub 间歇性超时，
// 而原生 https 模块用 HTTP/1.1 稳定连通。
// 设置 GITHUB_PROXY 环境变量可通过代理访问 GitHub（如 https://ghproxy.net/）

const GITHUB_PROXY = (process.env.GITHUB_PROXY || "").replace(/\/$/, "");

function githubFetch(url: string, init: RequestInit, retries = 3): Promise<Response> {
  const targetUrl = GITHUB_PROXY ? `${GITHUB_PROXY}/${url}` : url;

  const doRequest = (): Promise<Response> => {
    const reqPromise = new Promise<Response>((resolve, reject) => {
      const u = new URL(targetUrl);
      const opts: https.RequestOptions = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: init.method || "GET",
        headers: (init.headers as Record<string, string>) ?? {},
        timeout: 10_000,
      };

      const req = https.request(opts, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve(
            new Response(body, {
              status: res.statusCode ?? 500,
              statusText: res.statusMessage,
              headers: new Headers(
                Object.entries(res.headers).filter(([, v]) => typeof v === "string") as [string, string][]
              ),
            }),
          );
        });
      });

      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("connect timeout")); });

      if (init.body) req.write(init.body as string);
      req.end();
    });

    // TCP 握手超时：timeout 选项不管连接阶段，单独用 race 兜底
    const timeoutPromise = new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("connect timeout")), 10_000)
    );

    return Promise.race([reqPromise, timeoutPromise]);
  };

  let lastErr: unknown;
  return doRequest().catch(async (err) => {
    lastErr = err;
    for (let i = 1; i < retries; i++) {
      await new Promise((r) => setTimeout(r, 500)); // 500ms 间隔，快速重试
      try {
        return await doRequest();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  });
}

// ── Cookie 名称 ──

const STATE_COOKIE = "github_oauth_state";

// ── 判断是否为本地开发环境 ──

function isDevEnv(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return appUrl.includes("localhost") || appUrl.includes("127.0.0.1");
}

// ── 配置 ──

function getGitHubConfig() {
  const isDev = isDevEnv();

  const clientId = isDev
    ? (process.env.GITHUB_CLIENT_ID_DEV || process.env.GITHUB_CLIENT_ID)
    : process.env.GITHUB_CLIENT_ID;

  const clientSecret = isDev
    ? (process.env.GITHUB_CLIENT_SECRET_DEV || process.env.GITHUB_CLIENT_SECRET)
    : process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === "你的ClientID" || clientSecret === "你的ClientSecret") {
    return null;
  }

  return { clientId, clientSecret };
}

export function isGitHubConfigured(): boolean {
  return getGitHubConfig() !== null;
}

// ── 生成授权 URL ──

export function getGitHubAuthorizeUrl(redirectUri: string, state?: string) {
  const cfg = getGitHubConfig();
  if (!cfg) throw new Error("GitHub OAuth 未配置");

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state: state ?? crypto.randomUUID(),
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// ── State Cookie（CSRF 防护）──

export function setStateCookie(headers: Headers, state: string) {
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  );
}

export function getStateFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  return cookies[STATE_COOKIE] ?? null;
}

export function clearStateCookie(headers: Headers) {
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

// ── 用 code 换取 access_token ──

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export async function exchangeGitHubCode(code: string, redirectUri: string): Promise<GitHubTokenResponse> {
  const cfg = getGitHubConfig();
  if (!cfg) throw new Error("GitHub OAuth 未配置");

  const res = await githubFetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub token 交换失败 (${res.status}): ${body}`);
  }

  const data = await res.json();

  if ((data as { error?: string }).error) {
    throw new Error(`GitHub 返回错误: ${(data as { error_description?: string }).error_description ?? JSON.stringify(data)}`);
  }

  return data as GitHubTokenResponse;
}

// ── 获取 GitHub 用户信息 ──

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await githubFetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "resume-go-offer",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`获取 GitHub 用户信息失败 (${res.status}): ${body}`);
  }

  return res.json();
}

// ── 获取 GitHub 邮箱（user endpoint 可能不返回 email）──

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export async function getGitHubEmails(accessToken: string): Promise<GitHubEmail[]> {
  const res = await githubFetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "resume-go-offer",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`获取 GitHub 邮箱失败 (${res.status}): ${body}`);
  }

  return res.json();
}

// ── Cookie 解析 ──

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) result[key] = rest.join("=");
  }
  return result;
}
