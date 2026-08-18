/**
 * 附件解析工具 — AI 驱动的岗位 / 简历信息提取
 *
 * 将图片、网页文本、简历文件内容转化为结构化信息，
 * 方便注入对话上下文让 AI 顾问引用。
 */

import { currentAttachmentClient, currentAttachmentModel, currentVisionConfig, getRuntimeAiConfigs, safeJsonParse } from "./index";
import { JOB_PARSING_PROMPT, RESUME_FILE_PARSING_PROMPT } from "./prompts";
import { recordUsage } from "../billing/ledger";

/** 记账上下文：路由层显式传入用户身份（附件解析在独立路由，无 trace collector） */
export interface AttachmentUsageCtx {
  userId?: string;
  conversationId?: string;
  provider?: "platform" | "byok";
}

// ── Resume Workshop PDF 格式检测与解码 ──
// Resume Workshop 导出的 PDF 将简历数据用 base64 编码嵌入在文本中，
// AI 无法解析 base64，会幻觉出虚假姓名/公司。这里先解码为可读文本。

const RW_MARKER = "RESUME_WORKSHOP_IMPORT_V1_START";

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface RWModule {
  id: string;
  type: string;
  title: string;
  visible: boolean;
  basics?: { name?: string; email?: string; phone?: string; location?: string; infoItems?: Array<{ label: string; value: string; visible: boolean }> };
  items?: Array<{
    title: string;
    subtitle: string;
    startDate: string;
    endDate: string;
    description: string;
    visible: boolean;
  }>;
}

/**
 * 检测文本是否为 Resume Workshop 导出的 base64 编码 PDF，
 * 如果是则解码并格式化为人类可读的简历文本，否则返回 null。
 */
export function detectAndParseResumeWorkshop(text: string): string | null {
  const idx = text.indexOf(RW_MARKER);
  if (idx === -1) return null;

  try {
    // 提取 base64 载荷：转换 base64url → 标准 base64，清理非法字符
    let b64 = text.substring(idx + RW_MARKER.length);
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "");

    const decoded = Buffer.from(b64, "base64").toString("utf8");

    // 找到 JSON 边界（PDF 提取可能带尾部垃圾数据）
    let depth = 0;
    let jsonEnd = 0;
    for (let i = 0; i < decoded.length; i++) {
      if (decoded[i] === "{") depth++;
      if (decoded[i] === "}") {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }

    const cleanJson = decoded.substring(0, jsonEnd).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
    const data = JSON.parse(cleanJson);
    const modules: RWModule[] = data?.resume?.modules ?? [];
    if (modules.length === 0) return null;

    // 格式化为人类可读文本
    const lines: string[] = [];

    for (const mod of modules) {
      if (!mod.visible) continue;

      switch (mod.type) {
        case "basics": {
          const b = mod.basics;
          if (!b) break;
          lines.push(`姓名：${b.name || ""}`);
          if (b.email) lines.push(`邮箱：${b.email}`);
          if (b.phone) lines.push(`电话：${b.phone}`);
          if (b.location) lines.push(`城市：${b.location}`);
          for (const item of b.infoItems ?? []) {
            if (item.visible && item.value) lines.push(`${item.label}：${item.value}`);
          }
          break;
        }
        case "skills": {
          lines.push("\n专业技能：");
          for (const item of mod.items ?? []) {
            if (!item.visible) continue;
            const desc = item.description ? stripHtmlTags(item.description) : "";
            lines.push(`${item.title}：${desc}`);
          }
          break;
        }
        case "education": {
          lines.push("\n教育经历：");
          for (const item of mod.items ?? []) {
            if (!item.visible) continue;
            const period = [item.startDate, item.endDate].filter(Boolean).join("-");
            const detail = [item.title, item.subtitle, period].filter(Boolean).join(" | ");
            lines.push(`- ${detail}`);
          }
          break;
        }
        case "work": {
          lines.push("\n工作经历：");
          for (const item of mod.items ?? []) {
            if (!item.visible) continue;
            const period = [item.startDate, item.endDate].filter(Boolean).join("-");
            lines.push(`- ${item.title} | ${period}`);
            if (item.description) {
              for (const line of stripHtmlTags(item.description).split(/。\s*/)) {
                const trimmed = line.trim();
                if (trimmed) lines.push(`  ${trimmed}。`);
              }
            }
          }
          break;
        }
        case "projects": {
          lines.push("\n项目经历：");
          for (const item of mod.items ?? []) {
            if (!item.visible) continue;
            const period = [item.startDate, item.endDate].filter(Boolean).join("-");
            lines.push(`- ${item.title} | ${period}`);
            if (item.description) {
              lines.push(`  ${stripHtmlTags(item.description)}`);
            }
          }
          break;
        }
      }
    }

    const result = lines.join("\n").trim();
    return result.length >= 20 ? result : null;
  } catch {
    return null;
  }
}

// ── Zhipu Vision API 配置 ──

const ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
const VISION_MODEL = process.env.AI_VISION_MODEL ?? "glm-4v";

// ── 岗位信息类型 ──

export interface ParsedJob {
  company: string;
  position: string;
  location: string;
  salary: string;
  requirements: string[];
  responsibilities: string[];
  description: string;
}

// ── 图片 → 岗位信息（Zhipu GLM-4V vision model）──

export async function parseJobFromImage(base64: string, mimeType = "image/png", usageCtx?: AttachmentUsageCtx): Promise<ParsedJob | null> {
  const t0 = Date.now();
  console.log(`[parseJobFromImage] 开始解析，图片大小 ~${Math.round(base64.length / 1024)}KB`);

  // BYOK：用户 vision scope 配置优先，否则平台 glm-4v
  const visionCfg = currentVisionConfig();
  const apiKey = visionCfg?.apiKey ?? process.env.OPENAI_API_KEY;
  const baseURL = visionCfg?.baseUrl ?? process.env.OPENAI_BASE_URL ?? `${ZHIPU_BASE}/`;
  const model = visionCfg?.model ?? VISION_MODEL;

  // 使用 vision API 格式（OpenAI 兼容）
  const res = await fetch(`${baseURL}chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            { type: "text", text: JOB_PARSING_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[parseJobFromImage] Vision API error ${res.status}: ${errText}`);
    throw new Error(`图片解析失败 (${res.status})`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  console.log(`[parseJobFromImage] ${((Date.now() - t0) / 1000).toFixed(1)}s  output=${text.length}chars`);

  recordUsage({
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    source: "attachment",
    userId: usageCtx?.userId,
    conversationId: usageCtx?.conversationId,
    provider: visionCfg ? "byok" : (usageCtx?.provider ?? "platform"),
  });

  return safeJsonParse<ParsedJob>(text);
}

// ── 网页文本 → 岗位信息（text model）──

export async function parseJobFromText(content: string, usageCtx?: AttachmentUsageCtx): Promise<ParsedJob | null> {
  const t0 = Date.now();
  // 截断过长内容
  const truncated = content.slice(0, 20000);
  console.log(`[parseJobFromText] 开始解析，内容 ${truncated.length}chars`);

  const res = await currentAttachmentClient().chat.completions.create({
    model: currentAttachmentModel(),
    temperature: 0.2,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: JOB_PARSING_PROMPT },
      { role: "user", content: truncated },
    ],
  });

  const text = res.choices[0]?.message?.content?.trim() ?? "";
  console.log(`[parseJobFromText] ${((Date.now() - t0) / 1000).toFixed(1)}s  output=${text.length}chars`);

  recordUsage({
    model: currentAttachmentModel(),
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    source: "attachment",
    userId: usageCtx?.userId,
    conversationId: usageCtx?.conversationId,
    provider: getRuntimeAiConfigs()?.extract ? "byok" : (usageCtx?.provider ?? "platform"),
  });

  return safeJsonParse<ParsedJob>(text);
}

// ── 简历文本 → 结构化摘要 ──

export async function parseResumeFromFile(text: string, usageCtx?: AttachmentUsageCtx): Promise<string | null> {
  const t0 = Date.now();
  // 截断过长内容
  const truncated = text.slice(0, 16000);
  console.log(`[parseResumeFromFile] 开始解析，内容 ${truncated.length}chars`);

  const res = await currentAttachmentClient().chat.completions.create({
    model: currentAttachmentModel(),
    temperature: 0.2,
    max_tokens: 2048,
    messages: [
      { role: "system", content: RESUME_FILE_PARSING_PROMPT },
      { role: "user", content: truncated },
    ],
  });

  const result = res.choices[0]?.message?.content?.trim() ?? "";
  console.log(`[parseResumeFromFile] ${((Date.now() - t0) / 1000).toFixed(1)}s  output=${result.length}chars`);

  recordUsage({
    model: currentAttachmentModel(),
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    source: "attachment",
    userId: usageCtx?.userId,
    conversationId: usageCtx?.conversationId,
    provider: getRuntimeAiConfigs()?.extract ? "byok" : (usageCtx?.provider ?? "platform"),
  });

  return result || null;
}

/**
 * 将 ParsedJob 格式化为可注入对话的用户消息文本
 */
export function formatJobForChat(job: ParsedJob): string {
  const parts: string[] = [];
  parts.push(`**公司**：${job.company || "未知"}`);
  parts.push(`**岗位**：${job.position || "未知"}`);
  if (job.location) parts.push(`**城市**：${job.location}`);
  if (job.salary) parts.push(`**薪资**：${job.salary}`);
  if (job.description) parts.push(`**简介**：${job.description}`);
  if (job.requirements.length > 0) {
    parts.push(`**要求**：\n${job.requirements.map((r) => `- ${r}`).join("\n")}`);
  }
  if (job.responsibilities.length > 0) {
    parts.push(`**职责**：\n${job.responsibilities.map((r) => `- ${r}`).join("\n")}`);
  }
  return `[用户分享了一个岗位信息]\n\n${parts.join("\n")}`;
}

// ============================================================
// 附件解析公共入口 — 供 /api/chat（multipart 发送时解析）与
// /api/chat/parse-attachment（旧接口）复用
// ============================================================

/** 附件解析错误：带 HTTP 状态码，路由层据此返回 4xx 并给出可修复的提示 */
export class AttachmentParseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_DOC_SIZE = 15 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export function fileExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** AI 调用自动重试 1 次，消化上游 API 偶发超时/限流/5xx */
async function withRetry<T>(fn: () => Promise<T>, name: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[attachment] ${name} 首次失败，自动重试:`, err instanceof Error ? err.message : err);
    return await fn();
  }
}

export interface ParsedChatAttachment {
  kind: "job" | "resume";
  formatted: string;
}

/**
 * 简历文本 → 结构化摘要，AI 失败时用本地提取的原文兜底（确定性结果，不会失败）。
 */
async function parseResumeWithFallback(rawText: string, usageCtx?: AttachmentUsageCtx): Promise<string> {
  try {
    const summary = await withRetry(() => parseResumeFromFile(rawText, usageCtx), "parseResumeFromFile");
    if (summary && summary.trim()) return summary;
  } catch {
    // AI 摘要失败 → 原文兜底
  }
  return rawText.slice(0, 3000);
}

/**
 * 文件附件（图片/Word/PDF）→ 对话注入文本。
 * 输入不合格（超限/格式/扫描版 PDF）抛 AttachmentParseError，路由层返回 4xx。
 */
export async function parseAttachmentFile(file: File, usageCtx?: AttachmentUsageCtx): Promise<ParsedChatAttachment> {
  const fileName = file.name || "unknown";
  const mime = file.type || "";
  const ext = fileExt(fileName);
  const bytes = Buffer.from(await file.arrayBuffer());

  const isImage = IMAGE_MIMES.has(mime) || [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
  if (isImage) {
    if (bytes.length > MAX_IMAGE_SIZE) {
      throw new AttachmentParseError("图片文件过大（最大 10MB）", 413);
    }
    const base64 = bytes.toString("base64");
    const imgMime = mime || "image/png";
    let parsed: ParsedJob | null = null;
    try {
      parsed = await withRetry(() => parseJobFromImage(base64, imgMime, usageCtx), "parseJobFromImage");
    } catch (err) {
      throw new AttachmentParseError(
        `图片解析失败：${err instanceof Error ? err.message : "服务异常"}`,
        422,
      );
    }
    if (!parsed) {
      throw new AttachmentParseError("未能从图片中识别岗位信息，请确保图片中包含清晰的招聘信息", 422);
    }
    return { kind: "job", formatted: formatJobForChat(parsed) };
  }

  const isWord =
    mime.includes("wordprocessingml") || mime === "application/msword" || [".docx", ".doc"].includes(ext);
  if (isWord) {
    if (bytes.length > MAX_DOC_SIZE) {
      throw new AttachmentParseError("文件过大（最大 15MB）", 413);
    }
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    const text = result.value?.trim();
    if (!text || text.length < 20) {
      throw new AttachmentParseError("未能从文件中提取到文字内容", 422);
    }
    const content = await parseResumeWithFallback(text, usageCtx);
    return { kind: "resume", formatted: `[用户上传了简历文件]\n\n${content}` };
  }

  const isPdf = mime === "application/pdf" || ext === ".pdf";
  if (isPdf) {
    if (bytes.length > MAX_DOC_SIZE) {
      throw new AttachmentParseError("文件过大（最大 15MB）", 413);
    }
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? (item as { str: string }).str : ""))
        .join(" ");
      pages.push(pageText);
    }

    const rawText = pages.join("\n").trim();

    if (!rawText || rawText.length < 20) {
      throw new AttachmentParseError("未能从 PDF 中提取到文字内容（可能是扫描版 PDF）", 422);
    }

    // Resume Workshop 导出 PDF 的 base64 解码
    const decoded = detectAndParseResumeWorkshop(rawText);
    const content = await parseResumeWithFallback(decoded ?? rawText, usageCtx);

    return { kind: "resume", formatted: `[用户上传了简历文件]\n\n${content}` };
  }

  throw new AttachmentParseError("不支持的文件格式，请上传图片（PNG/JPG/WebP）、PDF 或 Word 文档", 400);
}

/**
 * URL 附件 → 岗位信息注入文本。
 * 抓取失败 / 识别失败抛 AttachmentParseError。
 */
export async function parseAttachmentUrl(url: string, usageCtx?: AttachmentUsageCtx): Promise<ParsedChatAttachment> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ResumeGoOffer/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    throw new AttachmentParseError(
      `无法访问该链接：${err instanceof Error ? err.message : "网络错误"}`,
      422,
    );
  }

  const text = stripHtml(html);
  if (!text || text.length < 50) {
    throw new AttachmentParseError("未能从该链接提取到有效内容", 422);
  }

  let parsed: ParsedJob | null = null;
  try {
    parsed = await withRetry(() => parseJobFromText(text, usageCtx), "parseJobFromText");
  } catch {
    throw new AttachmentParseError("未能从链接内容中识别岗位信息", 422);
  }
  if (!parsed) {
    throw new AttachmentParseError("未能从链接内容中识别岗位信息", 422);
  }

  return { kind: "job", formatted: formatJobForChat(parsed) };
}
