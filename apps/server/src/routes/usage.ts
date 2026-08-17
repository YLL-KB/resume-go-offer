/**
 * 用户用量路由 — 用户端「我的用量」（不进管理页）。
 * 只返回当前用户的账本数据：平台流量（含成本估算）与 BYOK 流量（平台零成本）分开。
 */

import { Hono } from "hono";
import { getAuthUserId } from "../lib/auth/utils";
import { getUserUsageDetail } from "../lib/billing/ledger";

export const usageRoutes = new Hono();

// ── GET /api/user/usage?days=30 ──
usageRoutes.get("/", async (c) => {
  const { userId } = await getAuthUserId(c.req.raw);
  const days = Math.max(1, Math.min(90, Number(c.req.query("days")) || 30));
  try {
    return c.json(getUserUsageDetail(userId, days));
  } catch (err) {
    console.error("[user/usage]", err);
    return c.json({ error: "获取用量失败" }, 500);
  }
});
