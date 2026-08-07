import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Android / iOS / HarmonyOS / 通用移动设备
const MOBILE_RE =
  /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|HarmonyOS|OpenHarmony|Mobile/i;

export function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const { pathname } = request.nextUrl;

  // 已经是移动端路由，放行
  if (pathname.startsWith("/m/")) return NextResponse.next();

  // 非对话页，放行（首页、简历等 PC/移动共用）
  if (!pathname.startsWith("/chat")) return NextResponse.next();

  // 移动设备访问 /chat → 重定向到 /m/chat
  if (MOBILE_RE.test(ua)) {
    const mobilePath = pathname.replace(/^\/chat/, "/m/chat");
    return NextResponse.redirect(new URL(mobilePath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|static|uploads|favicon\\.svg|register-sw\\.js).*)"],
};
