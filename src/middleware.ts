import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Android / iOS / HarmonyOS / 通用移动设备
const MOBILE_RE =
  /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|HarmonyOS|OpenHarmony|Mobile/i;

// HTML 文档走协商缓存（no-cache）：每次部署后浏览器重新请求，拿到最新 hashed 资源引用。
// 静态资源（/_next/static/*）由 public/_headers 用 immutable 强制缓存。
function withHtmlNoCache(response: NextResponse, request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    response.headers.set("Cache-Control", "no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
  }
  return response;
}

export function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const { pathname } = request.nextUrl;

  // 已经是移动端路由，放行
  if (pathname.startsWith("/m/")) {
    return withHtmlNoCache(NextResponse.next(), request);
  }

  // 非对话页，放行（首页、简历等 PC/移动共用）
  if (!pathname.startsWith("/chat")) {
    return withHtmlNoCache(NextResponse.next(), request);
  }

  // 移动设备访问 /chat → 重定向到 /m/chat
  if (MOBILE_RE.test(ua)) {
    const mobilePath = pathname.replace(/^\/chat/, "/m/chat");
    return NextResponse.redirect(new URL(mobilePath, request.url));
  }

  return withHtmlNoCache(NextResponse.next(), request);
}

export const config = {
  matcher: ["/((?!api|_next|static|uploads|favicon\\.svg|register-sw\\.js).*)"],
};
