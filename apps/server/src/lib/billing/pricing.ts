/**
 * 模型价格表 — 单位：元 / 1M tokens
 *
 * 价格是「快照」：官方调价频繁（如 DeepSeek 2026-08-17 起改峰谷定价），
 * 这里的值仅用于记账阶段的成本估算。真实收费前必须重新对齐官方价。
 *
 * 可用环境变量覆盖（部署时改价不动代码）：
 *   PRICE_JSON='{"glm-4-plus":{"input":5,"output":5},"deepseek-chat":{"input":2,"output":8}}'
 *
 * 记账时会快照单价到 token_usage.unit_price_*，之后改价不影响历史账。
 */

export interface ModelPrice {
  /** 输入价，元 / 1M tokens */
  input: number;
  /** 输出价，元 / 1M tokens */
  output: number;
}

/** 未收录模型的兜底价（参考 deepseek-chat 档） */
const DEFAULT_PRICE: ModelPrice = { input: 2, output: 8 };

/** 内置价格快照（2026-08 采集，随官方调价更新） */
const PRICING: Record<string, ModelPrice> = {
  // 智谱 BigModel
  "glm-4-plus": { input: 5, output: 5 },
  "glm-4-flash": { input: 0, output: 0 }, // 智谱免费档
  "glm-4v": { input: 5, output: 5 },
  "embedding-3": { input: 0.5, output: 0 },
  // DeepSeek（2026-08 起峰谷定价，此处取高峰档参考值）
  "deepseek-chat": { input: 2, output: 8 },
  "deepseek-reasoner": { input: 4, output: 16 },
  // OpenAI（美元价 × 7.2 粗略折算）
  "gpt-4o-mini": { input: 1.1, output: 4.3 },
  "gpt-4o": { input: 18, output: 72 },
};

function loadOverrides(): Record<string, ModelPrice> {
  try {
    const raw = process.env.PRICE_JSON ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, { input?: number; output?: number }>;
    const out: Record<string, ModelPrice> = {};
    for (const [model, p] of Object.entries(parsed)) {
      if (typeof p?.input === "number" || typeof p?.output === "number") {
        out[model] = {
          input: typeof p.input === "number" ? p.input : DEFAULT_PRICE.input,
          output: typeof p.output === "number" ? p.output : DEFAULT_PRICE.output,
        };
      }
    }
    return out;
  } catch {
    console.warn("[pricing] PRICE_JSON 解析失败，使用内置价格表");
    return {};
  }
}

const OVERRIDES = loadOverrides();

/** 查询模型单价（元 / 1M tokens），未收录返回兜底价 */
export function getModelPrice(model: string): ModelPrice {
  const m = OVERRIDES[model] ?? PRICING[model];
  if (m) return { input: m.input, output: m.output };
  return { ...DEFAULT_PRICE };
}

/** 计算一次调用的成本快照：单价（元/1M）+ 总成本（分） */
export function computeUsageCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { unitPriceInput: number; unitPriceOutput: number; costCents: number } {
  const p = getModelPrice(model);
  const costYuan = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return {
    unitPriceInput: p.input,
    unitPriceOutput: p.output,
    costCents: Math.round(costYuan * 100),
  };
}
