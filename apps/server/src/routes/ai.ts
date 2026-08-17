/**
 * AI 相关路由 — 简历分析 / 润色 / 解析 / 摘要。
 */

import { Hono } from "hono";
import { ai, streamToResponse, DEFAULT_MODEL, runWithAIConfig } from "../lib/ai";
import { getAuthUserId } from "../lib/auth/utils";
import { runWithUsage, recordUsage } from "../lib/billing/ledger";
import { getUserAiConfigs } from "../lib/billing/byok";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const aiRoutes = new Hono();

// 全部 AI 路由：注入用量记账的用户上下文 + BYOK chat 配置（深处的 tracedCompletion 自动归户/切 key）
aiRoutes.use("*", async (c, next) => {
  const { userId } = await getAuthUserId(c.req.raw);
  const chatUserCfg = getUserAiConfigs(userId).chat;
  const chatCfg = chatUserCfg
    ? { baseUrl: chatUserCfg.baseUrl, apiKey: chatUserCfg.apiKey, model: chatUserCfg.model }
    : null;
  return runWithUsage({ userId, provider: chatCfg ? "byok" : "platform" }, () =>
    runWithAIConfig(chatCfg ? { chat: chatCfg } : null, () => next()),
  );
});

/** 供流式路由显式记账（流消费发生在中间件 ALS 上下文之外，需闭包捕获） */
async function resolveRequestAi(request: Request): Promise<{ userId: string; model: string; provider: "platform" | "byok" }> {
  const { userId } = await getAuthUserId(request);
  const chatUserCfg = getUserAiConfigs(userId).chat;
  return {
    userId,
    model: chatUserCfg?.model ?? DEFAULT_MODEL,
    provider: chatUserCfg ? "byok" : "platform",
  };
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "analysis");
const MAX_AGE_MS = 30 * 60 * 1000; // 30 分钟自动清理

async function cleanup() {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    const now = Date.now();
    for (const f of files) {
      const p = path.join(UPLOAD_DIR, f);
      try {
        const stat = await fs.stat(p);
        if (now - stat.mtimeMs > MAX_AGE_MS) await fs.unlink(p);
      } catch { /* skip */ }
    }
  } catch { /* dir 不存在 */ }
}

// POST /api/ai/analyze-resume
aiRoutes.post("/analyze-resume", async (c) => {
  try {
    const { content } = await c.req.json() as { content: string };

    if (!content || typeof content !== "string" || content.trim().length < 50) {
      return c.json({ error: "简历内容太短，请上传完整的简历文件" }, 400);
    }

    if (c.req.query("stream") === "true") {
      const { userId, model, provider } = await resolveRequestAi(c.req.raw);
      const stream = await ai.analyzeResumeStream(content.trim());
      return new Response(streamToResponse(stream, (usage) => recordUsage({
        model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        source: "analyze",
        userId,
        provider,
      })), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const cleaned = content.replace(/\\u0000|[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim().slice(0, 4000);
    const analysis = await ai.analyzeResume(cleaned);
    return c.json(analysis);
  } catch (err) {
    console.error("AI analyze error:", err);
    return c.json({ error: "分析失败，请稍后再试" }, 500);
  }
});

// POST /api/ai/generate-summary
aiRoutes.post("/generate-summary", async (c) => {
  try {
    const profile = await c.req.json() as {
      name?: string;
      title?: string;
      skills?: string[];
      highlights?: string[];
    };

    const summary = await ai.generateSummary(profile);
    return c.json({ summary });
  } catch (err) {
    console.error("AI generate summary error:", err);
    return c.json({ error: "生成失败，请稍后再试" }, 500);
  }
});

// POST /api/ai/improve-resume
aiRoutes.post("/improve-resume", async (c) => {
  try {
    const { content, type, target } = await c.req.json() as { content: string; type: "weakness" | "suggestion"; target: string };

    if (!content || typeof content !== "string") {
      return c.json({ error: "缺少简历内容" }, 400);
    }

    if (!type || !["weakness", "suggestion"].includes(type)) {
      return c.json({ error: "type 必须是 weakness 或 suggestion" }, 400);
    }

    if (!target || typeof target !== "string") {
      return c.json({ error: "缺少优化目标描述" }, 400);
    }

    const improved = await ai.improveResumeSection(content.trim(), type, target.trim());
    return c.json({ improved, original: target, type });
  } catch (err) {
    console.error("AI improve error:", err);
    return c.json({ error: "优化失败，请稍后再试" }, 500);
  }
});

// POST /api/ai/improve
aiRoutes.post("/improve", async (c) => {
  try {
    const { text, context } = await c.req.json() as { text: string; context?: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return c.json({ error: "请提供需要润色的文本" }, 400);
    }

    if (c.req.query("stream") === "true") {
      const { userId, model, provider } = await resolveRequestAi(c.req.raw);
      const stream = await ai.improveTextStream(text.trim(), context);
      return new Response(streamToResponse(stream, (usage) => recordUsage({
        model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        source: "improve",
        userId,
        provider,
      })), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const improved = await ai.improveText(text.trim(), context);
    return c.json({ improved });
  } catch (err) {
    console.error("AI improve error:", err);
    return c.json({ error: "润色失败，请稍后再试" }, 500);
  }
});

// POST /api/ai/parse-resume
aiRoutes.post("/parse-resume", async (c) => {
  try {
    const { content } = await c.req.json() as { content: string };

    if (!content || typeof content !== "string") {
      return c.json({ error: "缺少简历内容" }, 400);
    }

    const cleaned = content.replace(/\\u0000|[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim().slice(0, 4000);
    const parsed = await ai.parseResume(cleaned);
    return c.json(parsed);
  } catch (err) {
    console.error("AI parse error:", err);
    return c.json({ error: "解析失败，请稍后再试" }, 500);
  }
});

// POST /api/ai/upload-resume
aiRoutes.post("/upload-resume", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "请上传一个 PDF 文件" }, 400);
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return c.json({ error: "仅支持 PDF 格式" }, 400);
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    void cleanup();

    const id = crypto.randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(UPLOAD_DIR, `${id}.pdf`), buf);

    return c.json({ id, url: `/api/analysis/${id}.pdf` });
  } catch (err) {
    console.error("Upload resume error:", err);
    return c.json({ error: "上传失败" }, 500);
  }
});
