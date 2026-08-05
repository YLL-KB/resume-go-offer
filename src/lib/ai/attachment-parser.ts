/**
 * 附件解析工具 — AI 驱动的岗位 / 简历信息提取
 *
 * 将图片、网页文本、简历文件内容转化为结构化信息，
 * 方便注入对话上下文让 AI 顾问引用。
 */

import { openai, extractClient, safeJsonParse, EXTRACT_MODEL } from "./index";
import { JOB_PARSING_PROMPT, RESUME_FILE_PARSING_PROMPT } from "./prompts";

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
