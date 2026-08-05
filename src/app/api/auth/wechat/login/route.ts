/**
 * GET /api/auth/wechat/login
 *
 * 重定向到微信开放平台扫码登录页。
 */

import { NextResponse } from "next/server";
import { getWechatLoginUrl, isWechatConfigured } from "@/lib/auth/wechat";

export async function GET() {
  if (!isWechatConfigured()) {
    return new NextResponse(
      '<html><body style="padding:40px;font-family:sans-serif"><h2>微信登录未配置</h2><p>请设置环境变量 <code>WECHAT_APP_ID</code> 和 <code>WECHAT_APP_SECRET</code></p></body></html>',
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const host = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${host}/api/auth/wechat/callback`;
  const url = getWechatLoginUrl(redirectUri);

  return NextResponse.redirect(url);
}
