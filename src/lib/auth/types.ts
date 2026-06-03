/**
 * 认证类型定义
 *
 * 与 Authing OIDC userinfo 返回字段对应。
 */

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  phone?: string | null;
  /** Authing 微信登录特有 */
  wechatOpenid?: string | null;
  /** Authing 支付宝登录特有 */
  alipayUserId?: string | null;
}

export interface Session {
  user: User;
  accessToken: string;
  idToken: string;
  expiresAt: Date;
}
