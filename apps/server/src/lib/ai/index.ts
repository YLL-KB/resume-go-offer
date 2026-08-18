/**
 * AI 调用封装
 *
 * 基于 OpenAI 兼容 SDK，支持 OpenAI / DeepSeek / 通义千问 等。
 * 切换模型只需改 .env.local 中的 OPENAI_BASE_URL 和 AI_MODEL。
 *
 * 用法:
 *   import { ai } from "@/lib/ai";
 *   const result = await ai.improveText("负责前端开发");
 */

import OpenAI from "openai";
import { AsyncLocalStorage } from "node:async_hooks";
import { getTraceCollector, recordDegradation } from "../observability/context";
import { recordUsage } from "../billing/ledger";

function checkApiKey(key: string | undefined, name: string): string {
  if (!key || key === "sk-placeholder") {
    const msg = `[AI] ⚠️ ${name} 未配置 — AI 功能将不可用。请在 .env.local 中设置 ${name}。`;
    if (process.env.NODE_ENV === "production") throw new Error(msg);
    console.warn(msg);
    return key ?? "sk-placeholder";
  }
  return key;
}

export const openai = new OpenAI({
  apiKey: checkApiKey(process.env.OPENAI_API_KEY, "OPENAI_API_KEY"),
  baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
});

/** 提取专用客户端：可用不同提供商（如 DeepSeek）追求速度 */
export const extractClient = new OpenAI({
  apiKey: checkApiKey(
    process.env.AI_EXTRACT_API_KEY ?? process.env.OPENAI_API_KEY,
    process.env.AI_EXTRACT_API_KEY ? "AI_EXTRACT_API_KEY" : "OPENAI_API_KEY",
  ),
  baseURL: process.env.AI_EXTRACT_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
});

export const DEFAULT_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";

/** 结构化提取等非聊天任务可用更快模型，默认复用 DEFAULT_MODEL */
export const EXTRACT_MODEL = process.env.AI_EXTRACT_MODEL ?? DEFAULT_MODEL;

// ── BYOK 配置注入：路由层 runWithAIConfig 包一层，深处调用按 scope 自动切用户客户端 ──

export interface RuntimeAiConfig {
  baseUrl: string;
  apiKey: string;
  /** 用户配置的模型（作为默认模型使用） */
  model: string;
}

export interface RuntimeAiConfigs {
  chat?: RuntimeAiConfig;
  extract?: RuntimeAiConfig;
  vision?: RuntimeAiConfig;
}

const aiConfigStorage = new AsyncLocalStorage<RuntimeAiConfigs>();

/** 在用户 AI 配置上下文中执行（无配置时传 null 即走平台 key） */
export function runWithAIConfig<T>(cfgs: RuntimeAiConfigs | null, fn: () => T): T {
  if (cfgs && Object.keys(cfgs).length > 0) return aiConfigStorage.run(cfgs, fn);
  return fn();
}

export function getRuntimeAiConfigs(): RuntimeAiConfigs | null {
  return aiConfigStorage.getStore() ?? null;
}

const userClientCache = new Map<string, OpenAI>();

function userClient(cfg: RuntimeAiConfig): OpenAI {
  const key = `${cfg.baseUrl}|${cfg.apiKey.slice(-6)}`;
  let client = userClientCache.get(key);
  if (!client) {
    client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
    userClientCache.set(key, client);
  }
  return client;
}

/** 当前请求的 chat 客户端：有用户 chat 配置用用户的，否则平台 key */
export function currentChatClient(): OpenAI {
  const cfg = aiConfigStorage.getStore()?.chat;
  return cfg ? userClient(cfg) : openai;
}

/** 当前请求的 chat 模型：有用户 chat 配置用用户配置的模型 */
export function currentChatModel(): string {
  return aiConfigStorage.getStore()?.chat?.model ?? DEFAULT_MODEL;
}

/** 当前请求的提取客户端/模型（简历提取引擎专用） */
export function currentExtractClient(): OpenAI {
  const cfg = aiConfigStorage.getStore()?.extract;
  return cfg ? userClient(cfg) : extractClient;
}

export function currentExtractModel(): string {
  return aiConfigStorage.getStore()?.extract?.model ?? EXTRACT_MODEL;
}

/** 附件解析专用模型：默认复用主对话模型（同 provider），可用 AI_ATTACHMENT_MODEL 指定更快模型 */
export const ATTACHMENT_MODEL = process.env.AI_ATTACHMENT_MODEL ?? DEFAULT_MODEL;

/** 附件解析客户端：BYOK extract scope 优先，否则走平台主客户端（更快的 provider） */
export function currentAttachmentClient(): OpenAI {
  const cfg = aiConfigStorage.getStore()?.extract;
  return cfg ? userClient(cfg) : openai;
}

export function currentAttachmentModel(): string {
  return aiConfigStorage.getStore()?.extract?.model ?? ATTACHMENT_MODEL;
}

/** 当前请求的视觉配置（图片识别）：用户 vision 配置优先，否则平台 glm-4v */
export function currentVisionConfig(): RuntimeAiConfig | null {
  return aiConfigStorage.getStore()?.vision ?? null;
}

/** 外部 AI 调用的兜底超时，防止上游 API 卡死导致流式对话挂起 */
const AI_TIMEOUT_MS = 90_000;

/**
 * 直连 SDK 调用的统一观测封装：对非流式 chat.completions.create 计时、
 * 记录 model/token/耗时到当前 trace（若在聊天图的 collector 上下文内），
 * 并把 token 用量写入计费账本（userId 来自 usageCtx / runWithUsage 上下文 / collector）。
 * 不在 trace 上下文时（独立路由调用）观测自动 no-op，记账照常。
 */
async function tracedCompletion(
  client: OpenAI,
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  name: string,
  createOptions?: { signal?: AbortSignal },
  usageCtx?: { userId?: string; conversationId?: string; source?: string; provider?: "platform" | "byok" },
): Promise<OpenAI.ChatCompletion> {
  const collector = getTraceCollector();
  const t0 = Date.now();
  try {
    const res = await client.chat.completions.create(params, createOptions);
    recordUsage({
      model: String(params.model),
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      source: usageCtx?.source ?? name,
      userId: usageCtx?.userId,
      conversationId: usageCtx?.conversationId,
      provider: usageCtx?.provider,
    });
    if (collector) {
      collector.addSpan({
        type: "model",
        name,
        model: String(params.model),
        input: params.messages,
        output: res.choices[0]?.message?.content,
        tokens: res.usage?.total_tokens ?? 0,
        durationMs: Date.now() - t0,
        status: "success",
      });
    }
    return res;
  } catch (err) {
    if (collector) {
      collector.addSpan({
        type: "model",
        name,
        model: String(params.model),
        durationMs: Date.now() - t0,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

console.log(`[AI] 聊天模型=${DEFAULT_MODEL}  提取模型=${EXTRACT_MODEL}  附件模型=${ATTACHMENT_MODEL}`);

if (process.env.LANGCHAIN_TRACING_V2 === "true" && process.env.LANGCHAIN_API_KEY) {
  console.log("[AI] LangSmith tracing enabled");
}

// ── 健壮的 JSON 解析：处理 AI 返回的常见格式瑕疵 ──
export function safeJsonParse<T>(text: string): T | null {
  // 1. 去掉 markdown 代码块包裹
  const cleaned = text
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();

  // 2. 直接尝试解析
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }

  // 3. 提取 JSON 对象或数组
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  let candidate = objMatch?.[0] ?? arrMatch?.[0] ?? cleaned;

  // 4. 修复常见问题
  // 去掉 trailing commas（对象和数组中）
  candidate = candidate.replace(/,(\s*[}\]])/g, "$1");
  // 去掉注释行
  candidate = candidate.replace(/^\s*\/\/.*$/gm, "");
  // 修复中文引号
  candidate = candidate.replace(/[“”]/g, '"');

  try { return JSON.parse(candidate) as T; } catch { /* continue */ }

  // 5. 提取所有可能的 JSON 对象（贪婪匹配可能失败时用更精确匹配）
  const braceStart = cleaned.indexOf("{");
  const bracketStart = cleaned.indexOf("[");
  if (braceStart === -1 && bracketStart === -1) return null;

  const start = braceStart >= 0 && (bracketStart < 0 || braceStart < bracketStart)
    ? braceStart : bracketStart;
  const endChar = cleaned[start] === "{" ? "}" : "]";
  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === cleaned[start]) depth++;
    else if (cleaned[i] === endChar) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end > start) {
    candidate = cleaned.slice(start, end + 1);
    candidate = candidate.replace(/,(\s*[}\]])/g, "$1");
    try { return JSON.parse(candidate) as T; } catch { /* continue */ }
  }

  // 6. 兜底：正则逐字段提取
  recordDegradation("regex_fallback");
  try {
    const ov = cleaned.match(/"overview"\s*:\s*"([^"]+)"/)?.[1] ?? "";
    const sc = parseInt(cleaned.match(/"score"\s*:\s*(\d+)/)?.[1] ?? "0");
    const arr = (key: string) => [...(cleaned.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`, "s"))?.[1]?.matchAll(/"([^"]+)"/g) ?? [])].map(m => m[1]);
    if (ov || sc > 0) return { overview: ov, score: sc, strengths: arr("strengths"), weaknesses: arr("weaknesses"), suggestions: arr("suggestions") } as T;
  } catch { /* pass */ }

  return null;
}

// ── 流式工具 ──

/**
 * 将 OpenAI stream 转为 ReadableStream<Uint8Array>，用于 API 路由响应。
 * onUsage：流结束时（最后一个带 usage 的 chunk）回调，用于计费埋点。
 */
export function streamToResponse(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  onUsage?: (usage: { prompt_tokens: number; completion_tokens: number }) => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) controller.enqueue(encoder.encode(content));
          // include_usage 时最后一个 chunk 携带 usage
          if (chunk.usage) onUsage?.(chunk.usage);
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.close();
      }
    },
  });
}

// ── 智能截断：优先保留用户内容，压缩 AI 追问 ──

function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // 按消息分块：[用户]: ... [顾问]: ...
  const blocks = text.split(/(?=\[用户\]:|\[顾问\]:)/);
  const userBlocks: string[] = [];
  const assistantBlocks: string[] = [];

  for (const block of blocks) {
    if (block.startsWith("[用户]:")) {
      userBlocks.push(block);
    } else if (block.startsWith("[顾问]:")) {
      assistantBlocks.push(block);
    }
  }

  // 策略：保留所有用户消息，压缩中间的 AI 追问消息
  const userTotal = userBlocks.reduce((sum, b) => sum + b.length, 0);

  // 用户内容超过上限：从最早的用户消息开始截断
  if (userTotal >= maxChars) {
    let kept = "";
    for (let i = userBlocks.length - 1; i >= 0; i--) {
      if (kept.length + userBlocks[i].length > maxChars) {
        kept = userBlocks[i].slice(-(maxChars - kept.length)) + kept;
        break;
      }
      kept = userBlocks[i] + kept;
    }
    return kept;
  }

  // 用户内容在范围内：尽量保留，剩余的配额给 AI 回复
  let remaining = maxChars - userTotal;
  const keptAssistant: string[] = [];

  // 优先保留最近的 AI 回复（从后往前取）
  for (let i = assistantBlocks.length - 1; i >= 0 && remaining > 0; i--) {
    const block = assistantBlocks[i];
    if (block.length <= remaining) {
      keptAssistant.unshift(block);
      remaining -= block.length;
    } else {
      // 截断这个 AI 回复，保留最后部分（通常是总结/优化建议）
      keptAssistant.unshift(block.slice(-remaining) + "...(截断)");
      remaining = 0;
    }
  }

  // 按原始顺序交错拼接
  const result: string[] = [];
  let ui = 0;
  let ai = 0;
  for (const block of blocks) {
    if (block.startsWith("[用户]:") && ui < userBlocks.length) {
      // 检查这个用户 block 是否在保留列表中
      if (userBlocks.includes(block)) result.push(block);
      ui++;
    } else if (block.startsWith("[顾问]:") && ai < assistantBlocks.length) {
      if (keptAssistant.includes(assistantBlocks[ai])) {
        result.push(assistantBlocks[ai]);
      }
      ai++;
    }
  }

  return result.join("");
}

// ── 结构化提取引擎：三组并行 + 增量省略 + 失败回退 ──
//
// 把整份简历提取拆成 core（basic/education/skills/summary 等）、
// experience、projects 三组并行调用。单次全量提取输出 ~8k token，
// 拆组后 wall-time ≈ 最重一组的生成时间，通常提速 2 倍以上。
// 已有一版「完整」简历时各组走差异检测提示词（只输出有变化的字段），
// 前端/服务端合并逻辑对「省略字段」天然安全（保留已有值）。

type ExtractSection = "core" | "experience" | "projects";
const EXTRACT_SECTIONS: ExtractSection[] = ["core", "experience", "projects"];

/**
 * 判断已有简历数据是否"完整"（经历过一次完整提取）。
 * 完整 → 增量差异提示词（只输出变化）；稀疏（仅表单数据）→ 全量提示词。
 */
function isRichResumeData(data?: Record<string, unknown> | null): boolean {
  if (!data) return false;
  const summary = data.summary;
  if (typeof summary === "string" && summary.trim().length >= 10) return true;

  const exp = Array.isArray(data.experience) ? data.experience : [];
  const prj = Array.isArray(data.projects) ? data.projects : [];
  return [...exp, ...prj].some((item) => {
    if (!item || typeof item !== "object") return false;
    const o = item as Record<string, unknown>;
    const desc = o.description;
    const highlights = o.highlights;
    return (typeof desc === "string" && desc.trim().length >= 20) ||
      (Array.isArray(highlights) && highlights.length > 0);
  });
}

/** 记账上下文（独立路由调用时显式传入用户身份；聊天图内可省略，走 collector） */
export interface UsageContextLike {
  userId?: string;
  conversationId?: string;
  provider?: "platform" | "byok";
}

/** 单组提取（含一次 JSON 解析失败重试），仍失败返回 null */
async function extractSectionOnce(
  section: ExtractSection,
  conversationHistory: string,
  resumeData: Record<string, unknown> | undefined,
  usageCtx?: UsageContextLike,
): Promise<Record<string, unknown> | null> {
  const { buildSectionExtractPrompt, buildIncrementalExtractPrompt } = await import("./prompts");
  const t0 = Date.now();
  // 完整已有数据 → 差异检测提示词（增量）；否则全量分块提示词
  const prompt = isRichResumeData(resumeData)
    ? buildIncrementalExtractPrompt(conversationHistory, resumeData as Record<string, unknown>, section)
    : buildSectionExtractPrompt(conversationHistory, resumeData, section);

  const res = await tracedCompletion(currentExtractClient(), {
    model: currentExtractModel(),
    temperature: 0.3,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  }, `extract-${section}`, { signal: AbortSignal.timeout(90_000) }, usageCtx);

  const text = res.choices[0]?.message?.content?.trim() ?? "";
  console.log(`[extract-${section}] ${((Date.now() - t0) / 1000).toFixed(1)}s  prompt=${prompt.length}chars  output=${text.length}chars`);

  const parsed = safeJsonParse<Record<string, unknown>>(text);
  if (parsed) return parsed;

  recordDegradation(`extract_${section}_json_retry`);
  const retry = await tracedCompletion(currentExtractClient(), {
    model: currentExtractModel(),
    temperature: 0.1,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "user", content: prompt + "\n\n注意：上次输出被截断了，请确保返回完整的 JSON。" },
    ],
  }, `extract-${section}-retry`, { signal: AbortSignal.timeout(90_000) }, usageCtx);
  const retryText = retry.choices[0]?.message?.content?.trim() ?? "";
  return safeJsonParse<Record<string, unknown>>(retryText);
}

/** 单次全量提取（并行分组失败时的回退，保证正确性优先） */
async function extractFullSingle(
  conversationHistory: string,
  resumeData?: Record<string, unknown> | null,
  usageCtx?: UsageContextLike,
): Promise<Record<string, unknown> | null> {
  const { buildExtractPrompt } = await import("./prompts");
  const t0 = Date.now();

  const truncated = smartTruncate(conversationHistory, 24000);
  const prompt = buildExtractPrompt(truncated, resumeData);

  console.log(`[extract-full] 模型=${currentExtractModel()}  prompt=${prompt.length}chars`);

  const res = await tracedCompletion(currentExtractClient(), {
    model: currentExtractModel(),
    temperature: 0.3,
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  }, "extractResume", { signal: AbortSignal.timeout(90_000) }, usageCtx);

  const text = res.choices[0]?.message?.content?.trim() ?? "";
  console.log(`[extract-full] AI 响应 ${((Date.now() - t0) / 1000).toFixed(1)}s  output=${text.length}chars`);

  const parsed = safeJsonParse<Record<string, unknown>>(text);
  if (parsed) return parsed;

  console.warn(`[extract-full] JSON 解析失败，重试中...`);
  recordDegradation("extract_json_retry");
  const retry = await tracedCompletion(currentExtractClient(), {
    model: currentExtractModel(),
    temperature: 0.1,
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "user", content: prompt + "\n\n注意：上次输出被截断了，请确保返回完整的 JSON，不要遗漏任何经历。" },
    ],
  }, "extractResume-retry", { signal: AbortSignal.timeout(90_000) }, usageCtx);
  const retryText = retry.choices[0]?.message?.content?.trim() ?? "";
  console.log(`[extract-full] 重试完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return safeJsonParse<Record<string, unknown>>(retryText);
}

/** 三组并行提取 + 合并；任一组最终失败则整体回退单次全量提取 */
async function extractResumeParallel(
  conversationHistory: string,
  resumeData?: Record<string, unknown> | null,
  usageCtx?: UsageContextLike,
): Promise<Record<string, unknown> | null> {
  const t0 = Date.now();
  const truncated = smartTruncate(conversationHistory, 24000);
  const resume = resumeData ?? undefined;

  const results = await Promise.all(
    EXTRACT_SECTIONS.map((section) => extractSectionOnce(section, truncated, resume, usageCtx)),
  );

  const merged: Record<string, unknown> = {};
  const failed: string[] = [];
  EXTRACT_SECTIONS.forEach((section, i) => {
    if (results[i]) Object.assign(merged, results[i] as Record<string, unknown>);
    else failed.push(section);
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[extract] 并行提取 ${elapsed}s  ${EXTRACT_SECTIONS.map((s, i) => `${s}:${results[i] ? "ok" : "FAIL"}`).join(" ")}`);

  if (failed.length > 0) {
    recordDegradation("extract_parallel_partial", { failed });
    console.warn(`[extract] 分组失败 [${failed.join(",")}]，回退单次全量提取`);
    return extractFullSingle(conversationHistory, resumeData, usageCtx);
  }
  return merged;
}

export const ai = {
  /**
   * 对话聊天 — 流式返回
   *
   * @param messages - 完整对话历史 [{ role: "user"|"assistant"|"system", content }]
   * @returns OpenAI stream
   */
  chat(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
    return currentChatClient().chat.completions.create({
      model: currentChatModel(),
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
      stream_options: { include_usage: true }, // 计费埋点：最后一个 chunk 携带 usage
      messages,
    });
  },

  /**
   * 从对话历史提取结构化简历数据
   *
   * 三组并行（core/experience/projects）+ 增量省略（有已有数据时），
   * 任一组失败自动回退单次全量提取。
   *
   * @param conversationHistory - 对话记录文本
   * @param resumeData - 当前已有简历数据（增量提取用）
   * @returns ResumeData JSON 对象
   */
  async extractResumeData(
    conversationHistory: string,
    resumeData?: Record<string, unknown> | null,
    usageCtx?: UsageContextLike,
  ): Promise<Record<string, unknown> | null> {
    return extractResumeParallel(conversationHistory, resumeData, usageCtx);
  },

  /**
   * 流式提取简历数据 — 返回 SSE ReadableStream
   *
   * 三组并行：core 组走流式作为前端进度展示，experience/projects
   * 组后台非流式并行执行；全部完成后合并发送 done。
   * 任一组失败回退单次全量提取，保证结果完整。
   */
  extractResumeDataStream(
    conversationHistory: string,
    resumeData?: Record<string, unknown> | null,
    usageCtx?: UsageContextLike,
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const truncated = smartTruncate(conversationHistory, 24000);
    const resume = resumeData ?? undefined;

    return new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        const t0 = Date.now();
        try {
          const { buildSectionExtractPrompt, buildIncrementalExtractPrompt } = await import("./prompts");

          // 完整已有数据 → 差异检测提示词（增量）；否则全量分块提示词
          const corePrompt = isRichResumeData(resume)
            ? buildIncrementalExtractPrompt(truncated, resume as Record<string, unknown>, "core")
            : buildSectionExtractPrompt(truncated, resume, "core");
          console.log(`[extract-stream] 模型=${currentExtractModel()}  并行三组提取  mode=${isRichResumeData(resume) ? "incremental" : "full"}  prompt=${corePrompt.length}chars`);

          const coreStream = await extractClient.chat.completions.create({
            model: currentExtractModel(),
            temperature: 0.3,
            max_tokens: 4096,
            stream: true as const,
            stream_options: { include_usage: true }, // 计费埋点：最后一个 chunk 携带 usage
            messages: [{ role: "user", content: corePrompt }],
          }, { signal: AbortSignal.timeout(120_000) });

          // 另外两组与 core 流同时启动（后台非流式）
          const expPromise = extractSectionOnce("experience", truncated, resume, usageCtx).catch(() => null);
          const prjPromise = extractSectionOnce("projects", truncated, resume, usageCtx).catch(() => null);

          let fullCore = "";
          let coreUsage: { prompt_tokens: number; completion_tokens: number } | null = null;
          for await (const chunk of coreStream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullCore += content;
              send({ type: "chunk", content });
            }
            if (chunk.usage) coreUsage = chunk.usage;
          }
          if (coreUsage) {
            recordUsage({
              model: currentExtractModel(),
              inputTokens: coreUsage.prompt_tokens,
              outputTokens: coreUsage.completion_tokens,
              source: "extract",
              userId: usageCtx?.userId,
              conversationId: usageCtx?.conversationId,
              provider: usageCtx?.provider,
            });
          }

          const corePart = safeJsonParse<Record<string, unknown>>(fullCore.trim());
          const [expPart, prjPart] = await Promise.all([expPromise, prjPromise]);

          const parts: Array<[string, Record<string, unknown> | null]> = [
            ["core", corePart],
            ["experience", expPart],
            ["projects", prjPart],
          ];
          const merged: Record<string, unknown> = {};
          const failed: string[] = [];
          for (const [name, part] of parts) {
            if (part) Object.assign(merged, part);
            else failed.push(name);
          }

          if (failed.length > 0) {
            recordDegradation("extract_stream_partial", { failed });
            console.warn(`[extract-stream] 分组失败 [${failed.join(",")}]，回退单次全量提取`);
            const fallback = await extractFullSingle(conversationHistory, resumeData, usageCtx);
            if (fallback) {
              send({ type: "done", data: fallback });
            } else {
              send({ type: "error", message: "简历提取失败，请重试" });
            }
          } else {
            send({ type: "done", data: merged });
          }
          console.log(`[extract-stream] 完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        } catch (err) {
          console.error(`[extract-stream] 失败:`, err instanceof Error ? err.message : err);
          send({ type: "error", message: err instanceof Error ? err.message : "提取失败" });
        } finally {
          controller.close();
        }
      },
    });
  },

  /**
   * 润色简历经历描述
   *
   * @param text - 用户写的原始描述，如"负责前端开发"
   * @param context - 可选的上下文信息，如目标岗位
   * @returns 润色后的描述
   */
  async improveText(text: string, context?: string): Promise<string> {
    const systemPrompt = [
      "你是一位专业的简历优化师。优化以下工作经历描述，使其更专业、更有说服力。",
      "规则：",
      "- 保持原文事实不变，不编造不存在的成就",
      "- 用有力的动词开头（主导、设计、实现、优化等）",
      "- 尽可能量化成果（如没有具体数字则不编造）",
      "- 控制在 2-3 句话以内",
      "- 直接返回优化后的文本，不要加引号或解释",
      context ? `\n目标岗位/行业: ${context}` : "",
    ].join("\n");

    const res = await tracedCompletion(currentChatClient(), {
      model: currentChatModel(),
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }, "improveText", { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    return res.choices[0]?.message?.content?.trim() ?? text;
  },

  /**
   * 生成个人总结（Self-Summary）
   */
  async generateSummary(profile: {
    name?: string;
    title?: string;
    skills?: string[];
    highlights?: string[];
  }): Promise<string> {
    const parts = [];
    if (profile.title) parts.push(`目标岗位: ${profile.title}`);
    if (profile.skills?.length) parts.push(`技能: ${profile.skills.join("、")}`);
    if (profile.highlights?.length) parts.push(`亮点: ${profile.highlights.join("；")}`);

    const res = await tracedCompletion(currentChatClient(), {
      model: currentChatModel(),
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `你是专业简历撰写师。根据用户信息生成一段 3-4 句话的自我总结。总结应突出核心竞争力、经验年限、关键成就。用简洁有力的中文。直接返回总结文本。`,
        },
        { role: "user", content: parts.join("\n") },
      ],
    }, "generateSummary", { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    return res.choices[0]?.message?.content?.trim() ?? "";
  },

  /**
   * 分析简历内容，返回结构化评估
   */
  async analyzeResume(content: string): Promise<{
    overview: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    score: number;
  }> {
    const res = await tracedCompletion(currentChatClient(), {
      model: currentChatModel(),
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `你是一位资深 HR 和职业规划师，同时也是简历优化专家。仔细分析以下简历，找出具体哪些文字需要改进。

请严格以 JSON 格式返回（纯 JSON，不要 markdown 代码块）：
{
  "overview": "2-3句话深度评价",
  "strengths": ["指出好的地方，格式：'[段落标题或关键词] + 优点描述'"],
  "weaknesses": ["指出具体有问题的文字和原因，格式：'「简历中原文片段」—— 问题描述'，如：'「负责前端开发工作」—— 描述过于笼统，没有体现具体贡献和成果'"],
  "suggestions": ["针对上面每条不足，给出具体改写示例，格式：'将「原文」改为「优化后」'，如：'将「负责前端开发工作」改为「主导前端架构设计，带领3人团队从0到1完成项目交付」'"],
  "score": 75
}

严格要求：
- weaknesses 必须引用简历中的原文原句，用「」标注
- suggestions 必须给出可直接替换的改写文本
- strengths/weaknesses/suggestions 各至少4条
- 每个 suggestion 必须对应一个 weakness`,
        },
        { role: "user", content },
      ],
    }, "analyzeResume", { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    const text = res.choices[0]?.message?.content?.trim() ?? "";
    const parsed = safeJsonParse<{
      overview: string;
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
      score: number;
    }>(text);
    if (parsed) return {
      overview: parsed.overview ?? "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      score: typeof parsed.score === "number" ? parsed.score : 0,
    };
    console.warn("[AI] analyzeResume JSON parse failed, raw response:", text.slice(0, 500));
    return {
      overview: "分析结果解析失败，请重试",
      strengths: [],
      weaknesses: [],
      suggestions: [],
      score: 0,
    };
  },

  /**
   * 根据分析结果中的不足/建议，AI 优化简历对应部分
   *
   * @param resumeContent - 原始简历全文
   * @param type - 优化类型："weakness" | "suggestion"
   * @param target - 要改进的具体描述（如"简历内容过于简略"）
   * @returns 优化建议文本
   */
  async improveResumeSection(
    resumeContent: string,
    type: "weakness" | "suggestion",
    target: string,
  ): Promise<string> {
    const systemPrompt = `你是资深简历优化师。问题是：${target}

从简历原文中找出与此问题直接相关的 3-5 处具体文字，逐条给出改写。

格式（严格按此格式，每条一行）：
原文「xxx」→ 改写「yyy」

规则：
- 「原文」必须从简历中逐字引用，不能自己编
- 「改写」保持事实不变，只优化表达方式
- 增加量化数据、强化动词、补充技术细节
- 不要任何解释和评价，只输出原文→改写

示例：
原文「负责前端开发工作」→ 改写「主导前端架构设计与核心模块开发，带领3人团队完成项目从0到1交付」
原文「使用React和TypeScript」→ 改写「基于React 18+TypeScript构建可复用组件库，组件复用率提升至85%」`;

    const res = await tracedCompletion(currentChatClient(), {
      model: currentChatModel(),
      temperature: 0.6,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `问题：${target}\n\n完整简历原文：\n${resumeContent.slice(0, 3000)}`,
        },
      ],
    }, "improveResumeSection", { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    return res.choices[0]?.message?.content?.trim() ?? "暂无优化建议";
  },

  /**
   * 将简历文本解析为结构化字段，用于表单编辑
   */
  async parseResume(content: string): Promise<{
    sections: {
      title: string;
      type: "fields" | "textarea" | "list";
      fields?: { key: string; label: string; value: string }[];
      content?: string;
      items?: { fields: { key: string; label: string; value: string }[] }[];
    }[];
  }> {
    const res = await tracedCompletion(currentChatClient(), {
      model: currentChatModel(),
      temperature: 0.3,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `你是一个简历解析器。将以下简历文本解析为结构化 JSON，用于前端表单编辑。

返回格式（纯 JSON，不要 markdown）：
{
  "sections": [
    {
      "title": "分区标题，如个人信息、专业技能",
      "type": "fields" | "textarea" | "list",
      // type="fields": 键值对字段
      "fields": [
        { "key": "name", "label": "姓名", "value": "实际值" },
        { "key": "phone", "label": "手机", "value": "138xxxx" }
      ],
      // type="textarea": 大段文本
      "content": "完整文本内容...",
      // type="list": 列表（工作经验/项目经历）
      "items": [
        {
          "fields": [
            { "key": "company", "label": "公司", "value": "XX公司" },
            { "key": "period", "label": "时间", "value": "2020-2023" }
          ]
        }
      ]
    }
  ]
}

规则：
- 信息分类要准确，不要编造不存在的内容
- 保留原文措辞，不要润色或改写
- fields 的 label 用中文，简明扼要
- 个人信息拆成各字段，不要合并`,
        },
        { role: "user", content },
      ],
    }, "parseResume", { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    const text = res.choices[0]?.message?.content?.trim() ?? "";
    const parsed = safeJsonParse<{
      sections: {
        title: string;
        type: "fields" | "textarea" | "list";
        fields?: { key: string; label: string; value: string }[];
        content?: string;
        items?: { fields: { key: string; label: string; value: string }[] }[];
      }[];
    }>(text);
    if (parsed?.sections) {
      // 兜底：确保每个 section 的字段完整性
      parsed.sections = parsed.sections.map(s => ({
        ...s,
        type: s.type ?? "textarea",
        fields: Array.isArray(s.fields) ? s.fields.map(f => ({ key: f.key ?? "", label: f.label ?? "", value: f.value ?? "" })) : [],
        items: Array.isArray(s.items) ? s.items.map(item => ({
          fields: Array.isArray(item.fields) ? item.fields.map(f => ({ key: f.key ?? "", label: f.label ?? "", value: f.value ?? "" })) : [],
        })) : [],
      }));
      return parsed;
    }
    // 兜底：当做一个纯文本段落
    return {
      sections: [
        {
          title: "简历内容",
          type: "textarea",
          content,
        },
      ],
    };
  },

  /**
   * 分析 PDF 模板的模块结构
   */
  async analyzeTemplate(text: string): Promise<{
    layout: string;
    sections: { id: string; label: string; order: number; type: string; description: string }[];
    style_hints: Record<string, unknown>;
  }> {
    const systemPrompt = `你是一个简历模板分析专家。分析下面的简历模板文字内容，识别出它包含哪些模块/部分。

返回纯 JSON（不要 markdown 包裹）：
{
  "layout": "single-column",
  "sections": [
    {
      "id": "唯一标识符",
      "label": "中文模块名称",
      "order": 0,
      "type": "header | summary | experience | education | projects | skills | certificates | custom",
      "description": "1-2句说明"
    }
  ],
  "style_hints": {
    "has_photo_area": false,
    "section_separator": "line"
  }
}`;

    const res = await tracedCompletion(currentChatClient(), {
      model: currentChatModel(),
      temperature: 0.1,
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `分析以下简历模板的文字内容，识别模块结构：\n\n${text.slice(0, 4000)}` },
      ],
    }, "analyzeTemplate", { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    const content = res.choices[0]?.message?.content?.trim() ?? "";
    const result = safeJsonParse<{
      layout: string;
      sections: { id: string; label: string; order: number; type: string; description: string }[];
      style_hints: Record<string, unknown>;
    }>(content);

    return result ?? {
      layout: "single-column",
      sections: [
        { id: "basic", label: "个人信息", order: 0, type: "header", description: "姓名、联系方式等" },
        { id: "experience", label: "工作经历", order: 1, type: "experience", description: "过往工作经历" },
        { id: "education", label: "教育背景", order: 2, type: "education", description: "学历信息" },
        { id: "skills", label: "技能", order: 3, type: "skills", description: "专业技能列表" },
      ],
      style_hints: { has_photo_area: false, section_separator: "line" },
    };
  },

  /**
   * 从简历 PDF 文本中提取标题和摘要
   */
  async summarizeTemplate(text: string): Promise<{ title: string; summary: string }> {
    const res = await tracedCompletion(currentChatClient(), {
      model: currentChatModel(),
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `你是一位简历信息提取助手。根据以下简历文本，提取出简历的标题和简短摘要。

返回纯 JSON，不要 markdown：
{
  "title": "简历标题，如"张三 · 高级前端工程师"",
  "summary": "2-3 句话概括：求职者经验年限、核心技能、目标岗位等关键信息"
}

如果文本太短或无法识别，title 返回"未知简历"，summary 返回"无法识别简历内容"。`,
        },
        { role: "user", content: `简历文本：\n${text.slice(0, 3000)}` },
      ],
    }, "summarizeTemplate", { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    const content = res.choices[0]?.message?.content?.trim() ?? "";
    const parsed = safeJsonParse<{ title: string; summary: string }>(content);
    return parsed ?? { title: "未知简历", summary: content.slice(0, 200) };
  },

  // ── 流式方法 ──

  /** 流式润色文本 */
  improveTextStream(text: string, context?: string) {
    const systemPrompt = [
      "你是一位专业的简历优化师。优化以下工作经历描述，使其更专业、更有说服力。",
      "规则：",
      "- 保持原文事实不变，不编造不存在的成就",
      "- 用有力的动词开头（主导、设计、实现、优化等）",
      "- 尽可能量化成果（如没有具体数字则不编造）",
      "- 控制在 2-3 句话以内",
      "- 直接返回优化后的文本，不要加引号或解释",
      context ? `\n目标岗位/行业: ${context}` : "",
    ].join("\n");

    return currentChatClient().chat.completions.create({
      model: currentChatModel(),
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true }, // 计费埋点：最后一个 chunk 携带 usage
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    });
  },

  /** 流式分析简历 */
  analyzeResumeStream(content: string) {
    return currentChatClient().chat.completions.create({
      model: currentChatModel(),
      temperature: 0.5,
      stream: true,
      stream_options: { include_usage: true }, // 计费埋点：最后一个 chunk 携带 usage
      messages: [
        {
          role: "system",
          content: `你是一位资深 HR 和职业规划师。分析以下简历内容，指出优缺点并给出改进建议。
请严格以 JSON 格式返回（不要 markdown 代码块，纯 JSON）：
{
  "overview": "整体评价（2-3句话）",
  "strengths": ["优点1", "优点2", "优点3"],
  "weaknesses": ["不足1", "不足2", "不足3"],
  "suggestions": ["改进建议1", "改进建议2", "改进建议3"],
  "score": 75
}`,
        },
        { role: "user", content },
      ],
    });
  },

  /**
   * 根据技能分类数据生成风格化技能区块 HTML
   * 使用 resume-styles-kit 规范，仅输出技能部分
   */
  async generateSkillsHtml(
    categorizedSkills: Record<string, string[]>,
    skillStyle: "A" | "B" | "D" = "B",
  ): Promise<string | null> {
    const { buildSkillsHtmlPrompt } = await import("./prompts");

    const res = await currentChatClient().chat.completions.create({
      model: currentChatModel(),
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        { role: "user", content: buildSkillsHtmlPrompt(categorizedSkills, skillStyle) },
      ],
    }, { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });

    const html = res.choices[0]?.message?.content?.trim() ?? "";
    if (!html) return null;

    return html
      .replace(/^```html?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  },

  /** 流式生成技能区块 HTML */
  generateSkillsHtmlStream(
    categorizedSkills: Record<string, string[]>,
    skillStyle: "A" | "B" | "D" = "B",
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        const startTime = Date.now();
        try {
          const { buildSkillsHtmlPrompt } = await import("./prompts");
          const prompt = buildSkillsHtmlPrompt(categorizedSkills, skillStyle);
          console.log(`[skills-render] Starting style ${skillStyle} — prompt ${prompt.length} chars`);

          const stream = await currentChatClient().chat.completions.create({
            model: currentChatModel(),
            temperature: 0.1,
            max_tokens: 2048,
            stream: true,
            messages: [
              { role: "user", content: prompt },
            ],
          });

          let fullHtml = "";
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullHtml += content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`),
              );
            }
          }

          const clean = fullHtml
            .replace(/^```html?\s*/i, "")
            .replace(/```\s*$/, "")
            .trim();

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[skills-render] Style ${skillStyle} done — ${clean.length} chars, ${elapsed}s`);

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", html: clean })}\n\n`),
          );
        } catch (err) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[skills-render] Style ${skillStyle} failed after ${elapsed}s:`, err instanceof Error ? err.message : err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "生成失败" })}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });
  },
};
