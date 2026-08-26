/**
 * 面试 Agent — 面试官出题/追问 + 评估报告 + 视频帧非语言分析。
 *
 * 面试是轮流说的回合制（提问 → 回答 → 追问），不需要 LangGraph 图编排，
 * 这里用普通函数封装三件事：
 *   - generateInterviewerTurn：根据简历 + JD + 已往问答，生成面试官下一句话
 *   - generateInterviewReport：面试结束后生成结构化评估报告
 *   - analyzeFrame：单帧视频画面 → 非语言表现（情绪/眼神/镜头/姿态）
 *
 * 全部复用 currentChatClient()/currentVisionConfig() 的 BYOK 注入机制，
 * 用量记账 source="interview"（语音/视觉/面试模型统一）。用户身份由路由层
 * 通过 usageCtx 显式传入（独立路由无 trace collector）。
 */

import { currentChatClient, currentChatModel, currentVisionConfig, safeJsonParse } from "../index";
import { recordUsage } from "../../billing/ledger";
import {
  INTERVIEWER_SYSTEM_PROMPT,
  INTERVIEW_OPENING_PROMPT,
  INTERVIEW_OPENING_FALLBACK,
  INTERVIEW_REPORT_PROMPT,
  FRAME_ANALYSIS_PROMPT,
} from "./prompts";

export interface InterviewUsageCtx {
  userId?: string;
  provider?: "platform" | "byok";
}

/** 面试问答消息（interviewer=面试官，candidate=候选人） */
export interface InterviewMessageLike {
  role: "interviewer" | "candidate";
  content: string;
}

export interface InterviewTurnResult {
  message: string;
  type: "question" | "followup" | "closing";
  done: boolean;
}

export interface InterviewReportDimension {
  name: string;
  score: number;
  comment: string;
}

export interface InterviewReportPerQuestion {
  question: string;
  answer: string;
  feedback: string;
  score: number;
}

export interface InterviewReport {
  score: number;
  summary: string;
  dimensions: InterviewReportDimension[];
  strengths: string[];
  improvements: string[];
  perQuestion: InterviewReportPerQuestion[];
}

export interface FrameAnalysis {
  emotion: string;
  eye_contact: string;
  in_frame: boolean;
  posture: string;
  comment: string;
}

const ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
const VISION_MODEL = process.env.AI_VISION_MODEL ?? "glm-4v";

function formatMessages(messages: InterviewMessageLike[]): string {
  return messages
    .map((m) => `${m.role === "interviewer" ? "面试官" : "候选人"}：${m.content}`)
    .join("\n\n");
}

function formatJd(jd: unknown): string {
  if (!jd) return "（无岗位 JD，请基于简历与通用岗位要求出题）";
  try {
    const obj = typeof jd === "string" ? JSON.parse(jd) : jd;
    if (obj && typeof obj === "object") {
      const j = obj as {
        company?: string; position?: string; location?: string; salary?: string;
        requirements?: string[]; responsibilities?: string[]; description?: string;
      };
      const parts: string[] = [];
      if (j.position) parts.push(`岗位：${j.position}`);
      if (j.company) parts.push(`公司：${j.company}`);
      if (j.location) parts.push(`城市：${j.location}`);
      if (j.description) parts.push(`简介：${j.description}`);
      if (Array.isArray(j.requirements) && j.requirements.length) {
        parts.push(`任职要求：\n${j.requirements.map((r) => `- ${r}`).join("\n")}`);
      }
      if (Array.isArray(j.responsibilities) && j.responsibilities.length) {
        parts.push(`岗位职责：\n${j.responsibilities.map((r) => `- ${r}`).join("\n")}`);
      }
      if (parts.length) return parts.join("\n");
    }
  } catch {
    // 非法 JSON → 当纯文本
  }
  return String(jd);
}

function formatResume(resumeData: unknown): string {
  if (!resumeData) return "（无简历数据）";
  try {
    return typeof resumeData === "string"
      ? resumeData
      : JSON.stringify(resumeData, null, 2);
  } catch {
    return String(resumeData);
  }
}

/**
 * 生成面试官下一句话（出题 / 追问 / 收尾）。
 *
 * @param messages 已往问答（不含即将生成的这一条）
 * @param resumeData 简历数据（对象或 JSON 字符串）
 * @param jd 岗位 JD（ParsedJob 对象或 JSON 字符串）
 * @param isOpening 是否为开场第一问
 */
export async function generateInterviewerTurn(
  messages: InterviewMessageLike[],
  resumeData: unknown,
  jd: unknown,
  isOpening: boolean,
  usageCtx?: InterviewUsageCtx,
): Promise<InterviewTurnResult> {
  const client = currentChatClient();
  const model = currentChatModel();
  const provider = usageCtx?.provider ?? "platform";

  const historyText = messages.length
    ? `\n\n【已进行的问答】\n${formatMessages(messages)}`
    : "\n\n【已进行的问答】\n（尚无，这是第一轮）";

  const userPrompt = isOpening
    ? INTERVIEW_OPENING_PROMPT
    : `请基于以上信息，生成面试官的下一句话（可能是针对上一条回答的追问，也可能是进入下一个问题，或收尾）。${historyText}`;

  const messagesInput = [
    { role: "system" as const, content: INTERVIEWER_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `【目标岗位 JD】\n${formatJd(jd)}\n\n【候选人简历】\n${formatResume(resumeData).slice(0, 6000)}\n\n${userPrompt}`,
    },
  ];

  const res = await client.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 512,
    response_format: { type: "json_object" },
    messages: messagesInput,
  });

  const text = res.choices[0]?.message?.content?.trim() ?? "";
  recordUsage({
    model,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    source: "interview",
    userId: usageCtx?.userId,
    provider,
  });

  const parsed = safeJsonParse<Partial<InterviewTurnResult>>(text);
  if (parsed?.message) {
    return {
      message: parsed.message.trim(),
      type: parsed.type === "closing" || parsed.type === "followup" ? parsed.type : "question",
      done: parsed.done === true,
    };
  }

  // 兜底：解析失败用开场白或要求继续
  return {
    message: isOpening ? INTERVIEW_OPENING_FALLBACK : "可以再展开说说吗？",
    type: isOpening ? "question" : "followup",
    done: false,
  };
}

/**
 * 生成面试评估报告。
 *
 * @param messages 完整问答记录
 * @param resumeData 简历数据
 * @param jd 岗位 JD
 * @param nonVerbalSummary 非语言分析汇总（可空）
 */
export async function generateInterviewReport(
  messages: InterviewMessageLike[],
  resumeData: unknown,
  jd: unknown,
  nonVerbalSummary: string,
  usageCtx?: InterviewUsageCtx,
): Promise<InterviewReport> {
  const client = currentChatClient();
  const model = currentChatModel();
  const provider = usageCtx?.provider ?? "platform";

  const userPrompt = [
    `【目标岗位 JD】\n${formatJd(jd)}`,
    `【候选人简历】\n${formatResume(resumeData).slice(0, 6000)}`,
    `【面试问答记录】\n${formatMessages(messages)}`,
    nonVerbalSummary
      ? `【非语言表现数据】\n${nonVerbalSummary}`
      : `【非语言表现数据】\n（本次面试未采集到非语言数据）`,
  ].join("\n\n");

  const res = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INTERVIEW_REPORT_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const text = res.choices[0]?.message?.content?.trim() ?? "";
  recordUsage({
    model,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    source: "interview",
    userId: usageCtx?.userId,
    provider,
  });

  const parsed = safeJsonParse<Partial<InterviewReport>>(text);
  if (parsed && typeof parsed === "object") {
    return {
      score: typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      dimensions: Array.isArray(parsed.dimensions)
        ? parsed.dimensions.map((d) => ({
            name: typeof d?.name === "string" ? d.name : "",
            score: typeof d?.score === "number" ? Math.round(d.score) : 0,
            comment: typeof d?.comment === "string" ? d.comment : "",
          }))
        : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s): s is string => typeof s === "string") : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.filter((s): s is string => typeof s === "string") : [],
      perQuestion: Array.isArray(parsed.perQuestion)
        ? parsed.perQuestion.map((q) => ({
            question: typeof q?.question === "string" ? q.question : "",
            answer: typeof q?.answer === "string" ? q.answer : "",
            feedback: typeof q?.feedback === "string" ? q.feedback : "",
            score: typeof q?.score === "number" ? Math.round(q.score) : 0,
          }))
        : [],
    };
  }

  return {
    score: 0,
    summary: "评估报告生成失败，请重试",
    dimensions: [],
    strengths: [],
    improvements: [],
    perQuestion: [],
  };
}

/**
 * 单帧视频画面 → 非语言表现分析（情绪/眼神/镜头/姿态）。
 * 复用 vision scope 的 BYOK 配置，缺省平台 glm-4v。
 */
export async function analyzeFrame(
  base64: string,
  mimeType = "image/jpeg",
  usageCtx?: InterviewUsageCtx,
): Promise<FrameAnalysis> {
  const visionCfg = currentVisionConfig();
  const apiKey = visionCfg?.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.ZHIPU_API_KEY ?? "";
  const baseURL = visionCfg?.baseUrl ?? process.env.OPENAI_BASE_URL ?? `${ZHIPU_BASE}/`;
  const model = visionCfg?.model ?? VISION_MODEL;

  if (!apiKey) {
    throw new Error("未配置视觉模型 API Key，无法进行非语言分析");
  }

  const res = await fetch(`${baseURL}chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: "text", text: FRAME_ANALYSIS_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`非语言分析失败 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";

  recordUsage({
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    source: "interview",
    userId: usageCtx?.userId,
    provider: visionCfg ? "byok" : (usageCtx?.provider ?? "platform"),
  });

  return safeJsonParse<FrameAnalysis>(text) ?? {
    emotion: "无法判断",
    eye_contact: "无法判断",
    in_frame: true,
    posture: "无法判断",
    comment: "分析失败",
  };
}
