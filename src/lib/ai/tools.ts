/**
 * LangGraph Agent — Tool 定义
 *
 * AI 通过调用这些工具来驱动前端行为（推表单、提取简历等），
 * 取代之前脆弱的正则 [FORM:xxx] 文本标记。
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { embedText } from "./embeddings";
import { vectorStore } from "./vectorstore";

const FORM_LABELS: Record<string, string> = {
  basic: "基本信息", education: "教育经历", experience: "工作经历",
  project: "项目经验", skills: "技能标签", summary: "个人总结",
};

// ── pushForm: 推送表单卡片 ──

export const pushFormTool = tool(
  async ({ type }) => {
    return `已推送「${FORM_LABELS[type]}」表单卡片。用户填写提交后你会收到 [已填写：${FORM_LABELS[type]}] 的消息。收到后继续推进对话。`;
  },
  {
    name: "pushForm",
    description:
      "推送一个表单卡片让用户填写简历信息。当需要收集用户的某个模块信息时调用此工具。" +
      "类型：basic(姓名/邮箱/电话/求职意向/城市/薪资)、education(学校/学历/专业/时间，可多条)、" +
      "experience(公司/职位/时间/工作内容，可多条)、project(项目名/技术栈/描述/链接，可多条)、" +
      "skills(技能标签列表)、summary(个人总结文本)。",
    schema: z.object({
      type: z.enum(["basic", "education", "experience", "project", "skills", "summary"] as const)
        .describe("要推送的表单类型"),
    }),
  },
);

// ── extractResume: 提取简历 ──

export const extractResumeTool = tool(
  async (_args, config) => {
    // 从 config 中读取消息历史
    const messages = (config.configurable?.messages as Array<{ role: string; content: string }>) ?? [];

    const conversationText = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `[${m.role === "user" ? "用户" : "顾问"}]: ${m.content}`)
      .join("\n\n");

    // 复用现有的提取逻辑
    const { ai } = await import("./index");
    const result = await ai.extractResumeData(conversationText);

    if (!result) {
      return JSON.stringify({ error: "简历提取失败，请让用户再补充一些信息后重试" });
    }

    return JSON.stringify(result);
  },
  {
    name: "extractResume",
    description:
      "从对话历史中提取结构化简历数据。当用户确认所有信息收集完毕、对内容满意后调用此工具。" +
      "调用前应该向用户确认：信息是否完整、是否需要修改。调用后系统会自动展示简历预览。",
    schema: z.object({}),
  },
);

// ── suggestOptimization: 润色建议 ──

export const suggestOptimizationTool = tool(
  async ({ text, context }) => {
    const { ai } = await import("./index");
    try {
      const optimized = await ai.improveText(text, context ?? undefined);
      return `优化建议：\n原始：「${text}」\n优化后：「${optimized}」\n\n请在回复中向用户展示这个优化结果，让用户确认是否接受。`;
    } catch {
      return "润色失败，请直接根据你的专业知识给用户提供优化建议。";
    }
  },
  {
    name: "suggestOptimization",
    description:
      "对用户提供的一段经历描述（工作经历或项目）进行专业优化改写。" +
      "当用户说了比较平淡、口语化、不够专业的描述时调用。参数 text 是需要优化的原文。",
    schema: z.object({
      text: z.string().describe("需要优化的原始文本"),
      context: z.string().optional().describe("可选的上下文，如目标岗位"),
    }),
  },
);

// ── searchKnowledge: 检索简历写作知识库 ──

export const searchKnowledgeTool = tool(
  async ({ query }) => {
    if (vectorStore.size === 0) {
      return "知识库尚未初始化，请稍后重试。";
    }
    const queryVector = await embedText(query);
    const results = vectorStore.search(queryVector, 3);
    if (results.length === 0) {
      return "未找到相关知识。请根据你的专业判断直接给用户建议。";
    }
    return results
      .map((r) => `[${r.metadata.category}] ${r.metadata.content}`)
      .join("\n\n---\n\n");
  },
  {
    name: "searchKnowledge",
    description:
      "搜索简历写作知识库，获取专业建议。当用户询问如何写好简历、怎么优化某个模块、" +
      "写作技巧、格式建议、ATS优化、STAR法则等问题时调用此工具。" +
      "查询应该聚焦于用户的具体问题，如'如何写好工作经历'或'技能标签怎么分类'。",
    schema: z.object({
      query: z.string().describe("搜索查询，用自然语言描述用户想了解的内容"),
    }),
  },
);

// ── 工具列表 ──

export const AGENT_TOOLS = [pushFormTool, extractResumeTool, suggestOptimizationTool, searchKnowledgeTool];

/** 按模式获取工具子集，减少无关工具干扰 */
export function getToolsForMode(mode: string) {
  switch (mode) {
    case "chatting":
      return [searchKnowledgeTool];
    case "collecting":
      return [pushFormTool, searchKnowledgeTool, suggestOptimizationTool];
    case "advising":
      return [suggestOptimizationTool, searchKnowledgeTool, pushFormTool];
    case "extracting":
      return [extractResumeTool, pushFormTool, suggestOptimizationTool, searchKnowledgeTool];
    default:
      return AGENT_TOOLS;
  }
}

// 导出类型给前端用
export type AgentToolName = "pushForm" | "extractResume" | "suggestOptimization" | "searchKnowledge";
