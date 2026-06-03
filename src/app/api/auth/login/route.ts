/**
 * GET /api/auth/login
 *
 * 重定向用户到 Authing 托管登录页。
 * 如果 Authing 未配置，返回配置指引页面。
 */

import { NextResponse } from "next/server";
import { getAuthorizationUrl, isAuthingConfigured } from "@/lib/auth/oidc";

export async function GET() {
  // 检查是否已配置
  if (!isAuthingConfigured()) {
    return new NextResponse(CONFIG_GUIDE_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const host = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${host}/api/auth/callback`;
  const loginUrl = getAuthorizationUrl(redirectUri);

  return NextResponse.redirect(loginUrl);
}

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
