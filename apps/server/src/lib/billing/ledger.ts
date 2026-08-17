/**
 * Token 用量账本 — 所有 AI 调用的统一埋点入口（只记账，不拦截）
 *
 * userId 解析优先级：
 *   1. 显式传入（流式/异步上下文不稳定的场景）
 *   2. runWithUsage 的 AsyncLocalStorage 上下文（独立 AI 路由）
 *   3. 当前请求的 trace collector（聊天图内部的工具/嵌入调用）
 *   4. 都没有 → 不记（知识库初始化等无人归属的调用）
 *
 * 收费窗口预留：
 *   - assertUsageAllowed() 是未来的额度检查钩子（套餐/钱包接入点），当前恒放行
 *   - token_usage.unit_price_* 快照单价，改价不影响历史账
 *   - costCents 已按快照价计算（BYOK 流量记 0，用户已向自己的供应商付费）
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "../../db";
import { tokenUsage } from "../../db/schema";
import { sql, type SQL } from "drizzle-orm";
import { getTraceCollector } from "../observability/context";
import { computeUsageCost } from "./pricing";

export interface UsageContext {
  userId: string;
  conversationId?: string;
  /** platform = 平台 key 调用；byok = 用户自带 key（cost 记 0） */
  provider?: "platform" | "byok";
}

const storage = new AsyncLocalStorage<UsageContext>();

/** 在独立 AI 路由中包裹处理逻辑，让深处的 recordUsage 拿到用户身份 */
export function runWithUsage<T>(ctx: UsageContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export interface UsageRecordInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** chat | router | extract | improve | analyze | summary | attachment | embedding | title | ... */
  source: string;
  /** 显式 userId（流式路径用）；缺省走上下文/collector */
  userId?: string;
  conversationId?: string;
  /** 显式 provider（BYOK 流量记 byok，成本记 0）；缺省走 runWithUsage 上下文，再缺省 platform */
  provider?: "platform" | "byok";
}

/**
 * 记录一次 AI 调用的 token 用量（fire-and-forget，同步 SQLite 插入）。
 * 用量为 0 或拿不到用户身份时跳过。
 */
export function recordUsage(input: UsageRecordInput): void {
  const ctx = storage.getStore();
  const collector = getTraceCollector();
  const userId = input.userId ?? ctx?.userId ?? collector?.userId ?? null;
  if (!userId) return;
  if (input.inputTokens <= 0 && input.outputTokens <= 0) return;

  const { costCents, unitPriceInput, unitPriceOutput } = computeUsageCost(
    input.model,
    input.inputTokens,
    input.outputTokens,
  );
  const provider = input.provider ?? ctx?.provider ?? "platform";

  try {
    getDb()
      .insert(tokenUsage)
      .values({
        id: crypto.randomUUID(),
        userId,
        model: input.model,
        provider,
        source: input.source,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        // BYOK：用户已向自己的供应商付费，平台成本记 0
        costCents: provider === "byok" ? 0 : costCents,
        unitPriceInput: String(unitPriceInput),
        unitPriceOutput: String(unitPriceOutput),
        conversationId: input.conversationId ?? ctx?.conversationId ?? collector?.conversationId ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    console.error("[usage] 记账失败:", err instanceof Error ? err.message : err);
  }
}

// ── 聚合查询（admin 报表 / 未来额度判断共用）──

function sumTokens(column: "input_tokens" | "output_tokens"): SQL<number> {
  return sql<number>`COALESCE(SUM(${sql.raw(column)}), 0)`;
}

export interface UsageSummaryRow {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  calls: number;
}

/** 某用户在某时间窗内的用量汇总（sinceIso = ISO 字符串，传 "" 表示全部） */
export function getUsageSummary(userId: string, sinceIso?: string): UsageSummaryRow {
  const db = getDb();
  const cond = sinceIso ? sql`user_id = ${userId} AND created_at >= ${sinceIso}` : sql`user_id = ${userId}`;
  const rows = db
    .select({
      inputTokens: sumTokens("input_tokens"),
      outputTokens: sumTokens("output_tokens"),
      costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(cond)
    .all();
  const r = rows[0];
  return {
    inputTokens: Number(r?.inputTokens ?? 0),
    outputTokens: Number(r?.outputTokens ?? 0),
    costCents: Number(r?.costCents ?? 0),
    calls: Number(r?.calls ?? 0),
  };
}

/** 全局用量汇总（admin 后台报表） */
export function getGlobalUsage(sinceIso?: string): UsageSummaryRow & { byModel: Array<{ model: string; inputTokens: number; outputTokens: number; costCents: number; calls: number }>; byProvider: Array<{ provider: string; inputTokens: number; outputTokens: number; costCents: number; calls: number }> } {
  const db = getDb();
  const cond = sinceIso ? sql`created_at >= ${sinceIso}` : undefined;

  const total = db
    .select({
      inputTokens: sumTokens("input_tokens"),
      outputTokens: sumTokens("output_tokens"),
      costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(cond)
    .all();

  const byModel = db
    .select({
      model: tokenUsage.model,
      inputTokens: sumTokens("input_tokens"),
      outputTokens: sumTokens("output_tokens"),
      costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(cond)
    .groupBy(tokenUsage.model)
    .all();

  const byProvider = db
    .select({
      provider: tokenUsage.provider,
      inputTokens: sumTokens("input_tokens"),
      outputTokens: sumTokens("output_tokens"),
      costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(cond)
    .groupBy(tokenUsage.provider)
    .all();

  const t = total[0];
  return {
    inputTokens: Number(t?.inputTokens ?? 0),
    outputTokens: Number(t?.outputTokens ?? 0),
    costCents: Number(t?.costCents ?? 0),
    calls: Number(t?.calls ?? 0),
    byModel: byModel.map((r) => ({
      model: r.model,
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      costCents: Number(r.costCents ?? 0),
      calls: Number(r.calls ?? 0),
    })),
    byProvider: byProvider.map((r) => ({
      provider: r.provider,
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      costCents: Number(r.costCents ?? 0),
      calls: Number(r.calls ?? 0),
    })),
  };
}

/**
 * 额度检查钩子 — 收费窗口预留。
 *
 * 当前策略：只记账不拦截（用户拍板）。未来接入收费时在此实现：
 *   1. 查 user_plans / plans.features（feature.unlimited_chat 等）拿额度
 *   2. getUsageSummary(userId, 当月窗口) 判断是否超限
 *   3. 超限返回 { allowed: false, reason }，调用方（chat/extract 等）直接短路
 */
export async function assertUsageAllowed(_userId: string): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  return { allowed: true };
}

// ── 用户自视角（用户端「我的用量」，不进管理页）──

export interface UserUsageDetail {
  days: number;
  since: string;
  platform: UsageSummaryRow;
  byok: UsageSummaryRow;
  /** 按来源 × provider 细分（对话/提取/附件/润色…） */
  bySource: Array<{
    source: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    calls: number;
  }>;
  /** 按模型 × provider 细分（哪个 API/模型花了多少 token） */
  byModel: Array<{
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    calls: number;
  }>;
}

/** 某用户在时间窗内的用量明细（platform / byok 分开 + 按来源细分） */
export function getUserUsageDetail(userId: string, days: number): UserUsageDetail {
  const clamped = Math.max(1, Math.min(90, days));
  const since = new Date(Date.now() - clamped * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();

  const bySourceRows = db
    .select({
      provider: tokenUsage.provider,
      source: tokenUsage.source,
      inputTokens: sumTokens("input_tokens"),
      outputTokens: sumTokens("output_tokens"),
      costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(sql`user_id = ${userId} AND created_at >= ${since}`)
    .groupBy(tokenUsage.provider, tokenUsage.source)
    .all();

  const byModelRows = db
    .select({
      provider: tokenUsage.provider,
      model: tokenUsage.model,
      inputTokens: sumTokens("input_tokens"),
      outputTokens: sumTokens("output_tokens"),
      costCents: sql<number>`COALESCE(SUM(cost_cents), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(tokenUsage)
    .where(sql`user_id = ${userId} AND created_at >= ${since}`)
    .groupBy(tokenUsage.provider, tokenUsage.model)
    .all();

  const empty = (): UsageSummaryRow => ({ inputTokens: 0, outputTokens: 0, costCents: 0, calls: 0 });
  const acc = (a: UsageSummaryRow, r: (typeof bySourceRows)[number]): UsageSummaryRow => ({
    inputTokens: a.inputTokens + Number(r.inputTokens ?? 0),
    outputTokens: a.outputTokens + Number(r.outputTokens ?? 0),
    costCents: a.costCents + Number(r.costCents ?? 0),
    calls: a.calls + Number(r.calls ?? 0),
  });

  let platform: UsageSummaryRow = empty();
  let byok: UsageSummaryRow = empty();
  for (const r of bySourceRows) {
    if (r.provider === "byok") byok = acc(byok, r);
    else platform = acc(platform, r);
  }

  return {
    days: clamped,
    since,
    platform,
    byok,
    bySource: bySourceRows.map((r) => ({
      source: r.source,
      provider: r.provider,
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      costCents: Number(r.costCents ?? 0),
      calls: Number(r.calls ?? 0),
    })),
    byModel: byModelRows
      .map((r) => ({
        model: r.model,
        provider: r.provider,
        inputTokens: Number(r.inputTokens ?? 0),
        outputTokens: Number(r.outputTokens ?? 0),
        costCents: Number(r.costCents ?? 0),
        calls: Number(r.calls ?? 0),
      }))
      .sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens)),
  };
}
