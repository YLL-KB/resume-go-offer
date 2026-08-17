/**
 * BYOK 配置路由 — 用户自带 API 的保存/读取/删除/连接测试。
 *
 * 每个用户可配置 1..N 条 API（名称/baseUrl/模型/Key/用途多选），
 * 用途（scopes）：chat（对话）/ extract（提取）/ vision（视觉），
 * 同一用途多条时最早创建的生效；未配置的环节回落平台 key。
 *
 * 安全约定：
 * - API Key 只进不出：所有响应只含掩码（maskApiKey）
 * - 存储为 AES-256-GCM 密文（见 lib/billing/byok.ts）
 * - 测试调用也写入用量账本（provider=byok，成本记 0）
 */

import { Hono } from "hono";
import { getAuthUserId } from "../lib/auth/utils";
import {
  getUserApi,
  getPublicApis,
  saveUserApi,
  deleteUserApi,
  markApiTest,
  testAiConfig,
  devEphemeral,
  AI_SCOPES,
  type AiScope,
} from "../lib/billing/byok";
import { recordUsage } from "../lib/billing/ledger";

export const byokRoutes = new Hono();

const MAX_APIS_PER_USER = 10;

function validateBaseUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function parseScopes(raw: unknown): AiScope[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.filter((s): s is string => typeof s === "string" && (AI_SCOPES as string[]).includes(s)) as AiScope[];
  return list.length > 0 ? [...new Set(list)] : null;
}

// ── GET /api/user/ai-config ── 全部 API 列表（掩码）
byokRoutes.get("/", async (c) => {
  const { userId } = await getAuthUserId(c.req.raw);
  return c.json({ apis: getPublicApis(userId), devEphemeral: devEphemeral() });
});

// ── PUT /api/user/ai-config ── 保存/更新一条 API（带 id 更新，无 id 新建）
byokRoutes.put("/", async (c) => {
  const { userId } = await getAuthUserId(c.req.raw);
  const body = await c.req.json().catch(() => null) as {
    id?: string;
    name?: string;
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    scopes?: unknown;
  } | null;

  const baseUrl = String(body?.baseUrl ?? "").trim();
  const model = String(body?.model ?? "").trim();
  const apiKey = String(body?.apiKey ?? "").trim();
  const scopes = parseScopes(body?.scopes);

  if (!baseUrl || !model || !apiKey) return c.json({ error: "baseUrl、model、apiKey 均为必填" }, 400);
  if (!scopes) return c.json({ error: "用途（scopes）至少选择一个环节：chat / extract / vision" }, 400);
  if (!validateBaseUrl(baseUrl)) return c.json({ error: "baseUrl 必须是合法的 http(s) 地址" }, 400);
  if (apiKey.length > 300) return c.json({ error: "apiKey 长度不合法" }, 400);

  // 新建时限制数量
  if (!body?.id) {
    const current = getPublicApis(userId);
    if (current.length >= MAX_APIS_PER_USER) {
      return c.json({ error: `最多配置 ${MAX_APIS_PER_USER} 条 API` }, 400);
    }
  }

  try {
    const id = saveUserApi(userId, {
      id: body?.id,
      name: String(body?.name ?? "").trim().slice(0, 40),
      provider: String(body?.provider ?? "").trim() || "custom",
      baseUrl,
      model,
      apiKey,
      scopes,
    });
    return c.json({ ok: true, id, apis: getPublicApis(userId), devEphemeral: devEphemeral() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "保存失败" }, 400);
  }
});

// ── DELETE /api/user/ai-config?id= ── 删除一条 API
byokRoutes.delete("/", async (c) => {
  const { userId } = await getAuthUserId(c.req.raw);
  const id = String(c.req.query("id") ?? "").trim();
  if (!id) return c.json({ error: "id 必填" }, 400);
  deleteUserApi(userId, id);
  return c.json({ ok: true, apis: getPublicApis(userId) });
});

// ── POST /api/user/ai-config/test ── 用已保存的某条 API 发一次极小调用
byokRoutes.post("/test", async (c) => {
  const { userId } = await getAuthUserId(c.req.raw);
  const body = await c.req.json().catch(() => null) as { id?: string } | null;
  const id = String(body?.id ?? "").trim();
  if (!id) return c.json({ error: "id 必填" }, 400);

  const api = getUserApi(userId, id);
  if (!api) return c.json({ error: "API 配置不存在" }, 404);

  const result = await testAiConfig(api);
  markApiTest(userId, id, result.ok);
  recordUsage({
    model: api.model,
    inputTokens: result.inputTokens ?? 0,
    outputTokens: result.outputTokens ?? 0,
    source: "byok-test",
    userId,
    provider: "byok",
  });

  return c.json(result);
});
