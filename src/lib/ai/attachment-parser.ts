/**
 * 附件解析工具 — AI 驱动的岗位 / 简历信息提取
 *
 * 将图片、网页文本、简历文件内容转化为结构化信息，
 * 方便注入对话上下文让 AI 顾问引用。
 */

import { extractClient, safeJsonParse, EXTRACT_MODEL } from "./index";
import { JOB_PARSING_PROMPT, RESUME_FILE_PARSING_PROMPT } from "./prompts";

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

export async function parseJobFromImage(base64: string, mimeType = "image/png"): Promise<ParsedJob | null> {
  const t0 = Date.now();
  console.log(`[parseJobFromImage] 开始解析，图片大小 ~${Math.round(base64.length / 1024)}KB`);

  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL ?? `${ZHIPU_BASE}/`;

  // 使用 Zhipu 原生 vision API 格式
  const res = await fetch(`${baseURL}chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
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

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  console.log(`[parseJobFromImage] ${((Date.now() - t0) / 1000).toFixed(1)}s  output=${text.length}chars`);

  return safeJsonParse<ParsedJob>(text);
}

// ── 网页文本 → 岗位信息（text model）──

export async function parseJobFromText(content: string): Promise<ParsedJob | null> {
  const t0 = Date.now();
  // 截断过长内容
  const truncated = content.slice(0, 20000);
  console.log(`[parseJobFromText] 开始解析，内容 ${truncated.length}chars`);

  const res = await extractClient.chat.completions.create({
    model: EXTRACT_MODEL,
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

  return safeJsonParse<ParsedJob>(text);
}

// ── 简历文本 → 结构化摘要 ──

export async function parseResumeFromFile(text: string): Promise<string | null> {
  const t0 = Date.now();
  // 截断过长内容
  const truncated = text.slice(0, 16000);
  console.log(`[parseResumeFromFile] 开始解析，内容 ${truncated.length}chars`);

  const res = await extractClient.chat.completions.create({
    model: EXTRACT_MODEL,
    temperature: 0.2,
    max_tokens: 2048,
    messages: [
      { role: "system", content: RESUME_FILE_PARSING_PROMPT },
      { role: "user", content: truncated },
    ],
  });

  const result = res.choices[0]?.message?.content?.trim() ?? "";
  console.log(`[parseResumeFromFile] ${((Date.now() - t0) / 1000).toFixed(1)}s  output=${result.length}chars`);

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
