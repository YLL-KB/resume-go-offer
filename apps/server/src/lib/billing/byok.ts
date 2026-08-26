/**
 * BYOK — 用户自带 API（OpenAI 兼容），1..N 条自定义 API 账号
 *
 * 每个 API 条目：名称 / baseUrl / 模型 / Key + 用途（scopes 多选：chat/extract/vision）。
 * 环节解析：某环节配置了多条 API 时，最早创建的生效；未配置的环节回落平台 key。
 *
 * 环节含义（运行时消费者）：
 *   chat    — 主对话 worker / 对话标题 / 润色·分析·摘要·解析 / 模板分析（AI_MODEL + openai）
 *   extract — 简历提取引擎 / 附件文字解析（AI_EXTRACT_*）
 *   vision  — 岗位截图识别（glm-4v）
 * router（glm-4-flash 免费分类）与 embedding（RAG 基础设施）恒走平台侧。
 *
 * 存储：user_ai_apis 表，api_key_enc 为 AES-256-GCM 密文（v1:iv:tag:cipher）。
 * 主密钥 BYOK_MASTER_KEY（64 位 hex）；开发缺省用进程内临时密钥（重启失效），生产缺省报错。
 */

import OpenAI from "openai";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getDb } from "../../db";
import { userAiApis } from "../../db/schema";
import { asc, eq } from "drizzle-orm";

// ── 加密 ──

const ALGO = "aes-256-gcm";
const ENC_VERSION = "v1";

let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey;
  const raw = process.env.BYOK_MASTER_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    _masterKey = Buffer.from(raw, "hex");
  } else if (process.env.NODE_ENV === "development") {
    // 本地开发：进程内随机密钥（重启失效，仅调试用）
    _masterKey = randomBytes(32);
    console.warn("[byok] BYOK_MASTER_KEY 未配置，使用进程内临时密钥（仅开发环境）。生产环境必须配置 64 位 hex 密钥。");
  } else {
    throw new Error("[byok] 服务端未配置 BYOK_MASTER_KEY（64 位 hex），无法加解密用户 API Key");
  }
  return _masterKey;
}

/** 是否使用开发临时密钥（重启后旧密文无法解密，需提示用户重新保存） */
export function isDevEphemeralKey(): boolean {
  const raw = process.env.BYOK_MASTER_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) return false;
  return process.env.NODE_ENV === "development";
}

export function encryptApiKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptApiKey(enc: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = enc.split(":");
    if (version !== ENC_VERSION) return null;
    const decipher = createDecipheriv(ALGO, getMasterKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/** 掩码展示：sk-ab****yz（保留前 2 后 4，长度不足只留后 4） */
export function maskApiKey(plain: string): string {
  if (plain.length <= 8) return `${plain.slice(0, 2)}****`;
  return `${plain.slice(0, 2)}****${plain.slice(-4)}`;
}

// ── 类型 ──

export type AiScope = "chat" | "extract" | "vision";
export const AI_SCOPES: AiScope[] = ["chat", "extract", "vision"];

export interface UserAiApi {
  id: string;
  userId: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string; // 解密后的明文，仅在服务端内存流转
  scopes: AiScope[];
}

/** 运行时按环节使用的配置视图（保留 scope 字段供调用方/记账用） */
export interface UserAiConfig {
  userId: string;
  scope: AiScope;
  apiId: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface UserAiApiPublic {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  scopes: AiScope[];
  isActive: boolean;
  maskedKey: string;
  lastTestAt: string | null;
  lastTestOk: number | null;
}

export interface SaveApiInput {
  id?: string;
  name?: string;
  provider?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  scopes: AiScope[];
}

// ── 解析辅助 ──

function parseScopes(raw: string): AiScope[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((s): s is AiScope => (AI_SCOPES as string[]).includes(s)) : [];
  } catch {
    return [];
  }
}

// ── 存取 ──

/** 读取用户全部活跃 API（已解密），按创建时间升序 */
export function getUserApis(userId: string): UserAiApi[] {
  const db = getDb();
  const rows = db.select().from(userAiApis).where(eq(userAiApis.userId, userId)).orderBy(asc(userAiApis.createdAt)).all();
  const out: UserAiApi[] = [];
  for (const row of rows) {
    if (row.isActive !== 1) continue;
    const apiKey = decryptApiKey(row.apiKeyEnc);
    if (!apiKey) {
      console.warn(`[byok] 用户 ${userId} 的 API「${row.name}」Key 解密失败（主密钥变更？），跳过`);
      continue;
    }
    out.push({
      id: row.id,
      userId: row.userId,
      name: row.name,
      provider: row.provider,
      baseUrl: row.baseUrl,
      model: row.model,
      apiKey,
      scopes: parseScopes(row.scopes),
    });
  }
  return out;
}

/**
 * 按环节解析生效配置：每个 scope 取「最早创建」的、用途包含该 scope 的 API；
 * 未配置的 scope 为 null（调用方回落平台 key）。
 */
export function getUserAiConfigs(userId: string): Record<AiScope, UserAiConfig | null> {
  const out: Record<AiScope, UserAiConfig | null> = { chat: null, extract: null, vision: null };
  for (const api of getUserApis(userId)) {
    for (const scope of api.scopes) {
      if (!out[scope]) {
        out[scope] = {
          userId,
          scope,
          apiId: api.id,
          provider: api.provider,
          baseUrl: api.baseUrl,
          model: api.model,
          apiKey: api.apiKey,
        };
      }
    }
  }
  return out;
}

/** 读取某条 API（已解密），不存在/未激活/解密失败返回 null */
export function getUserApi(userId: string, id: string): UserAiApi | null {
  const db = getDb();
  const [row] = db.select().from(userAiApis).where(eq(userAiApis.id, id)).limit(1).all();
  if (!row || row.userId !== userId || row.isActive !== 1) return null;
  const apiKey = decryptApiKey(row.apiKeyEnc);
  if (!apiKey) return null;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey,
    scopes: parseScopes(row.scopes),
  };
}

/** 保存 API（带 id 更新，无 id 新建；key 重新加密） */
export function saveUserApi(userId: string, input: SaveApiInput): string {
  const db = getDb();
  const now = new Date().toISOString();

  if (input.id) {
    const [existing] = db.select().from(userAiApis).where(eq(userAiApis.id, input.id)).limit(1).all();
    if (!existing || existing.userId !== userId) throw new Error("API 配置不存在");
    db.update(userAiApis)
      .set({
        name: input.name ?? existing.name,
        provider: input.provider ?? existing.provider,
        baseUrl: input.baseUrl,
        model: input.model,
        apiKeyEnc: encryptApiKey(input.apiKey),
        scopes: JSON.stringify(input.scopes),
        isActive: 1,
        updatedAt: now,
      })
      .where(eq(userAiApis.id, input.id))
      .run();
    return input.id;
  }

  const id = crypto.randomUUID();
  db.insert(userAiApis)
    .values({
      id,
      userId,
      name: input.name ?? "",
      provider: input.provider ?? "custom",
      baseUrl: input.baseUrl,
      model: input.model,
      apiKeyEnc: encryptApiKey(input.apiKey),
      scopes: JSON.stringify(input.scopes),
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

/** 删除某条 API（id 必填） */
export function deleteUserApi(userId: string, id: string): void {
  getDb().delete(userAiApis).where(eq(userAiApis.id, id)).run();
}

/** 公开视图（掩码 key，绝不返回明文） */
export function getPublicApis(userId: string): UserAiApiPublic[] {
  const db = getDb();
  const rows = db.select().from(userAiApis).where(eq(userAiApis.userId, userId)).orderBy(asc(userAiApis.createdAt)).all();
  return rows.map((row) => {
    const plain = decryptApiKey(row.apiKeyEnc) ?? "";
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      baseUrl: row.baseUrl,
      model: row.model,
      scopes: parseScopes(row.scopes),
      isActive: row.isActive === 1,
      maskedKey: plain ? maskApiKey(plain) : "解密失败",
      lastTestAt: row.lastTestAt,
      lastTestOk: row.lastTestOk,
    };
  });
}

/** 更新最近一次测试结果 */
export function markApiTest(userId: string, id: string, ok: boolean): void {
  getDb()
    .update(userAiApis)
    .set({ lastTestAt: new Date().toISOString(), lastTestOk: ok ? 1 : 0 })
    .where(eq(userAiApis.id, id))
    .run();
}

/** 是否使用开发临时密钥（供前端提示） */
export function devEphemeral(): boolean {
  return isDevEphemeralKey();
}

// ── 客户端 ──

const clientCache = new Map<string, OpenAI>();

/** 按配置构建（并缓存）OpenAI 兼容客户端 */
export function getClientForConfig(cfg: { baseUrl: string; apiKey: string }): OpenAI {
  const key = `${cfg.baseUrl}|${cfg.apiKey.slice(-6)}`;
  let client = clientCache.get(key);
  if (!client) {
    client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
    clientCache.set(key, client);
  }
  return client;
}

/** 测试连接：发一次极小调用，返回耗时或错误信息 */
export async function testAiConfig(cfg: { baseUrl: string; apiKey: string; model: string }): Promise<{ ok: boolean; latencyMs?: number; inputTokens?: number; outputTokens?: number; error?: string }> {
  const t0 = Date.now();
  try {
    const client = getClientForConfig(cfg);
    const res = await client.chat.completions.create(
      {
        model: cfg.model,
        max_tokens: 8,
        temperature: 0,
        messages: [{ role: "user", content: "hi" }],
      },
      { signal: AbortSignal.timeout(20_000) },
    );
    const text = res.choices[0]?.message?.content ?? "";
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      error: text ? undefined : "模型返回了空内容",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: Date.now() - t0, error: msg.slice(0, 300) };
  }
}
