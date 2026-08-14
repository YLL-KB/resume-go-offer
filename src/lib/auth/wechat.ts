/**
 * 微信开放平台 OAuth2.0 登录工具
 *
 * 直接对接微信开放平台网站应用登录，不依赖 Authing。
 * 文档：https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 */

// ============================================================
// 配置
// ============================================================

function getWechatConfig() {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret || appId === "你的AppID" || appSecret === "你的AppSecret") {
    return null;
  }

  return { appId, appSecret };
}

export function isWechatConfigured(): boolean {
  return getWechatConfig() !== null;
}

// ============================================================
// 生成微信扫码登录 URL
// ============================================================

export function getWechatLoginUrl(redirectUri: string, state?: string) {
  const cfg = getWechatConfig();
  if (!cfg) throw new Error("微信开放平台未配置");

  const params = new URLSearchParams({
    appid: cfg.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snsapi_login",
    state: state ?? crypto.randomUUID(),
  });

  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

// ============================================================
// 用 code 换取 access_token
// ============================================================

export interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
}

export async function exchangeWechatCode(code: string): Promise<WechatTokenResponse> {
  const cfg = getWechatConfig();
  if (!cfg) throw new Error("微信开放平台未配置");

  const params = new URLSearchParams({
    appid: cfg.appId,
    secret: cfg.appSecret,
    code,
    grant_type: "authorization_code",
  });

  const res = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`微信 token 交换失败 (${res.status}): ${body}`);
  }

  const data = await res.json();

  if ((data as { errcode?: number }).errcode) {
    throw new Error(`微信返回错误: ${(data as { errmsg?: string }).errmsg ?? JSON.stringify(data)}`);
  }

  return data as WechatTokenResponse;
}

// ============================================================
// 获取微信用户信息
// ============================================================

export interface WechatUser {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
}

export async function getWechatUserInfo(accessToken: string, openid: string): Promise<WechatUser> {
  const params = new URLSearchParams({
    access_token: accessToken,
    openid,
    lang: "zh_CN",
  });

  const res = await fetch(`https://api.weixin.qq.com/sns/userinfo?${params.toString()}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`获取微信用户信息失败 (${res.status}): ${body}`);
  }

  const data = await res.json();

  if ((data as { errcode?: number }).errcode) {
    throw new Error(`微信返回错误: ${(data as { errmsg?: string }).errmsg ?? JSON.stringify(data)}`);
  }

  return data as WechatUser;
}
