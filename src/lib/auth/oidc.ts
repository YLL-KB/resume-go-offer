/**
 * Authing OIDC 工具函数
 *
 * 基于标准 OIDC 协议对接 Authing 托管登录页。
 * 不引入第三方 SDK，纯 Web API（fetch / Web Crypto），适配 Cloudflare Pages Edge Runtime。
 */

// ============================================================
// 从环境变量读取 Authing 配置
// 你需要在 Authing 控制台创建应用后填入:
//   https://console.authing.cn
// ============================================================

function getAuthingConfig() {
  const appId = process.env.AUTHING_APP_ID;
  const appSecret = process.env.AUTHING_APP_SECRET;
  const issuer = process.env.AUTHING_ISSUER;

  // 占位值（未配置）视为缺失
  if (!appId || !appSecret || !issuer ||
      appId === "你的AppID" ||
      appSecret === "你的AppSecret" ||
      issuer.includes("你的应用域名")) {
    return null;
  }

  const baseUrl = issuer.replace(/\/$/, "");

  return {
    appId,
    appSecret,
    issuer: baseUrl,
    authorizationEndpoint: `${baseUrl}/oidc/auth`,
    tokenEndpoint: `${baseUrl}/oidc/token`,
    userinfoEndpoint: `${baseUrl}/oidc/me`,
    endSessionEndpoint: `${baseUrl}/oidc/session/end`,
  };
}

// ============================================================
// 检查 Authing 是否已配置
// ============================================================

export function isAuthingConfigured(): boolean {
  return getAuthingConfig() !== null;
}

// ============================================================
// 生成 Authing 托管登录页 URL
// ============================================================

export function getAuthorizationUrl(redirectUri: string, state?: string) {
  const cfg = getAuthingConfig();
  if (!cfg) throw new Error("Authing 配置不完整");
  const { appId, authorizationEndpoint } = cfg;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email phone",
    nonce: crypto.randomUUID(),
    state: state ?? crypto.randomUUID(),
  });
  return `${authorizationEndpoint}?${params.toString()}`;
}

// ============================================================
// 用 authorization code 换取 token
// ============================================================

interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResponse> {
  const cfg2 = getAuthingConfig();
  if (!cfg2) throw new Error("Authing 配置不完整");
  const { appId, appSecret, tokenEndpoint } = cfg2;

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token 交换失败 (${res.status}): ${body}`);
  }

  return res.json();
}

// ============================================================
// 用 access_token 获取用户信息
// ============================================================

export interface AuthingUser {
  sub: string;
  name?: string;
  email?: string;
  phone_number?: string;
  picture?: string;
  username?: string;
  wechat_openid?: string;
  unionid?: string;
  alipay_user_id?: string;
}

export async function getUserInfo(accessToken: string): Promise<AuthingUser> {
  const cfg3 = getAuthingConfig();
  if (!cfg3) throw new Error("Authing 配置不完整");
  const { userinfoEndpoint } = cfg3;

  const res = await fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`获取用户信息失败 (${res.status}): ${body}`);
  }

  return res.json();
}

// ============================================================
// 退出登录 URL
// ============================================================

export function getLogoutUrl(postLogoutRedirectUri: string, idToken?: string) {
  const cfg4 = getAuthingConfig();
  if (!cfg4) throw new Error("Authing 配置不完整");
  const { appId, endSessionEndpoint } = cfg4;
  const params = new URLSearchParams({
    client_id: appId,
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
  if (idToken) {
    params.set("id_token_hint", idToken);
  }
  return `${endSessionEndpoint}?${params.toString()}`;
}

// ============================================================
// Cookie 操作工具（Edge Runtime 安全）
// ============================================================

const SESSION_COOKIE = "auth_session";

export function setSessionCookie(
  headers: Headers,
  accessToken: string,
  idToken: string,
  expiresIn: number,
) {
  const maxAge = expiresIn;
  const cookieValue = JSON.stringify({ accessToken, idToken });

  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(cookieValue)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  );
}

export function getSessionFromCookie(request: Request): { accessToken: string; idToken: string } | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = parseCookies(cookieHeader);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;

  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function clearSessionCookie(headers: Headers) {
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) result[key] = rest.join("=");
  }
  return result;
}
