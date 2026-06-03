/**
 * 认证模块入口
 *
 * 基于 Authing OIDC 托管登录页，不引入第三方 SDK。
 *
 * 接入流程:
 *   1. 在 Authing 控制台 (console.authing.cn) 创建应用
 *   2. 配置登录方式：微信 / 支付宝 / 手机号验证码 等
 *   3. 设置回调地址: https://你的域名/api/auth/callback
 *   4. 在 wrangler.jsonc / .dev.vars 中填入环境变量:
 *      AUTHING_APP_ID, AUTHING_APP_SECRET, AUTHING_ISSUER
 *
 * 在页面中获取当前用户:
 *   // 服务端
 *   import { getUser } from "@/lib/auth";
 *   const user = await getUser(request);
 *
 *   // 客户端
 *   import { useAuth } from "@/hooks/use-auth";
 *   const { user, isSignedIn } = useAuth();
 */

export type { User, Session } from "./types";

/**
 * 服务端获取当前登录用户（从 cookie 中读取 session）
 *
 * @param request - Next.js Request 对象
 * @returns 用户对象或 null（未登录）
 */
export async function getUser(request: Request) {
  // 从 auth_user cookie 读取（由 callback 写入）
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = parseCookies(cookieHeader);
  const raw = cookies["auth_user"];
  if (!raw) return null;

  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/**
 * 检查用户是否已登录（服务端）
 */
export async function isAuthenticated(request: Request): Promise<boolean> {
  const user = await getUser(request);
  return user !== null;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) result[key] = rest.join("=");
  }
  return result;
}
