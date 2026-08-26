/**
 * 视频模拟面试路由 — 会话创建 / 语音问答 / 视频帧分析 / 评估报告。
 *
 * 面试是轮流说的回合制（提问 → 回答 → 追问），走普通 JSON API，不做 SSE 长连接：
 *   POST /                发起面试（简历 + JD → 建 session + 首问 + TTS 音频）
 *   GET  /                我的面试列表
 *   GET  /:id             会话详情（消息历史 + 简历 + JD）
 *   POST /:id/audio       上传用户回答音频 → ASR → 追加消息 → 生成下一问 + TTS
 *   POST /:id/frame       上传视频帧 → glm-4v 非语言分析 → 记到最近候选回答
 *   POST /:id/complete    结束面试 → 生成评估报告
 *   GET  /:id/report      返回评估报告
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { interviewSessions, interviewMessages, resumes, applications } from "../db/schema";
import { getAuthUserId } from "../lib/auth/utils";
import { getUserAiConfigs } from "../lib/billing/byok";
import { runWithUsage } from "../lib/billing/ledger";
import { ai, runWithAIConfig, safeJsonParse, type RuntimeAiConfigs } from "../lib/ai";
import {
  extractDocumentText,
  parseJobFromImage,
  parseJobFromUrl,
  AttachmentParseError,
  MAX_DOC_SIZE,
  MAX_IMAGE_SIZE,
} from "../lib/ai/attachment-parser";
import { speechToText, textToSpeech, textToSpeechChunks, pcmChunksToWavBase64 } from "../lib/ai/voice";
import {
  generateInterviewerTurn,
  generateInterviewReport,
  analyzeFrame,
  type InterviewMessageLike,
  type FrameAnalysis,
} from "../lib/ai/interview";
import { eq, and, asc, desc } from "drizzle-orm";

export const interviewRoutes = new Hono();

/** 解析用户 BYOK 配置（chat 供面试官模型、vision 供帧分析、extract 供简历提取） */
function buildRuntime(userId: string): {
  cfgs: RuntimeAiConfigs | null;
  chatProvider: "platform" | "byok";
  extractProvider: "platform" | "byok";
} {
  const userCfgs = getUserAiConfigs(userId);
  const cfgs: RuntimeAiConfigs = {};
  if (userCfgs.chat) {
    cfgs.chat = { baseUrl: userCfgs.chat.baseUrl, apiKey: userCfgs.chat.apiKey, model: userCfgs.chat.model };
  }
  if (userCfgs.extract) {
    cfgs.extract = { baseUrl: userCfgs.extract.baseUrl, apiKey: userCfgs.extract.apiKey, model: userCfgs.extract.model };
  }
  if (userCfgs.vision) {
    cfgs.vision = { baseUrl: userCfgs.vision.baseUrl, apiKey: userCfgs.vision.apiKey, model: userCfgs.vision.model };
  }
  return {
    cfgs: Object.keys(cfgs).length > 0 ? cfgs : null,
    chatProvider: userCfgs.chat ? "byok" : "platform",
    extractProvider: userCfgs.extract ? "byok" : "platform",
  };
}

/** 读取会话 + 简历数据（校验归属） */
function loadSession(db: ReturnType<typeof getDb>, sessionId: string, userId: string) {
  const [session] = db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)))
    .limit(1)
    .all();
  if (!session) return null;

  let resumeData: unknown = null;
  const [resume] = db.select().from(resumes).where(eq(resumes.id, session.resumeId)).limit(1).all();
  if (resume) {
    try {
      resumeData = JSON.parse(resume.data);
    } catch {
      resumeData = resume.data;
    }
  }
  return { session, resumeData };
}

/** 读取会话消息，转为面试问答（interviewer/candidate） */
function loadMessages(db: ReturnType<typeof getDb>, sessionId: string) {
  return db
    .select()
    .from(interviewMessages)
    .where(eq(interviewMessages.sessionId, sessionId))
    .orderBy(asc(interviewMessages.createdAt))
    .all();
}

function toTurnMessages(rows: ReturnType<typeof loadMessages>): InterviewMessageLike[] {
  return rows
    .filter((m) => m.role === "interviewer" || m.role === "candidate")
    .map((m) => ({ role: m.role as "interviewer" | "candidate", content: m.content }));
}

/** 汇总候选回答的非语言分析数据，作为报告输入 */
function buildNonVerbalSummary(rows: ReturnType<typeof loadMessages>): string {
  const entries: Array<{
    question: string;
    emotion: Record<string, number>;
    eye_contact: string;
    in_frame_ratio: number;
  }> = [];
  for (const m of rows) {
    if (m.role !== "candidate" || !m.nonVerbal) continue;
    const analyses = safeJsonParse<FrameAnalysis[]>(m.nonVerbal) ?? [];
    if (!analyses.length) continue;
    const emotion: Record<string, number> = {};
    for (const a of analyses) emotion[a.emotion] = (emotion[a.emotion] ?? 0) + 1;
    const inFrame = analyses.filter((a) => a.in_frame).length / analyses.length;
    entries.push({
      question: m.content.slice(0, 50),
      emotion,
      eye_contact: analyses[analyses.length - 1]?.eye_contact ?? "无法判断",
      in_frame_ratio: Math.round(inFrame * 100) / 100,
    });
  }
  return entries.length > 0 ? JSON.stringify(entries) : "";
}

// ── GET /api/interview ── 我的面试列表
interviewRoutes.get("/", async (c) => {
  try {
    const { userId } = await getAuthUserId(c.req.raw);
    const db = getDb();
    const rows = db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, userId))
      .orderBy(desc(interviewSessions.createdAt))
      .all();
    return c.json(
      rows.map((r) => ({
        id: r.id,
        position: r.position,
        company: r.company,
        status: r.status,
        score: r.score,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  } catch (err) {
    console.error("获取面试列表失败", err);
    return c.json({ error: "获取失败" }, 500);
  }
});

// ── POST /api/interview ── 发起面试
interviewRoutes.post("/", async (c) => {
  try {
    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
    if (isAnonymous) return c.json({ error: "请先登录" }, 401);

    const body = (await c.req.json().catch(() => null)) as {
      resumeId?: string;
      jd?: string;
      applicationId?: string;
    } | null;
    if (!body?.resumeId) return c.json({ error: "resumeId 必填" }, 400);

    const db = getDb();
    const [resume] = db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, body.resumeId), eq(resumes.userId, userId)))
      .limit(1)
      .all();
    if (!resume) return c.json({ error: "简历不存在" }, 404);

    let resumeData: unknown;
    try {
      resumeData = JSON.parse(resume.data);
    } catch {
      resumeData = resume.data;
    }

    let jd: string | null = body.jd ?? null;
    let position: string | null = null;
    let company: string | null = null;
    let applicationId: string | null = null;

    if (body.applicationId) {
      const [app] = db
        .select()
        .from(applications)
        .where(and(eq(applications.id, body.applicationId), eq(applications.userId, userId)))
        .limit(1)
        .all();
      if (app) {
        applicationId = app.id;
        if (!jd && app.jd) jd = app.jd;
        position = app.position ?? null;
        company = app.company ?? null;
      }
    }

    if (jd && (!position || !company)) {
      const parsed = safeJsonParse<{ position?: string; company?: string }>(jd);
      if (parsed) {
        position = position ?? parsed.position ?? null;
        company = company ?? parsed.company ?? null;
      }
    }

    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    await db.insert(interviewSessions).values({
      id: sessionId,
      userId,
      resumeId: body.resumeId,
      applicationId,
      jd,
      position,
      company,
      status: "in_progress",
      createdAt: now,
      updatedAt: now,
    });

    const { cfgs, chatProvider } = buildRuntime(userId);
    const result = await runWithAIConfig(cfgs, () =>
      runWithUsage({ userId, provider: "platform" }, async () => {
        const turn = await generateInterviewerTurn([], resumeData, jd, true, {
          userId,
          provider: chatProvider,
        });
        const audioBase64 = await textToSpeech(turn.message);
        await db.insert(interviewMessages).values({
          id: crypto.randomUUID(),
          sessionId,
          role: "interviewer",
          content: turn.message,
          audioBase64,
          createdAt: new Date().toISOString(),
        });
        return { message: turn.message, audioBase64, done: turn.done };
      }),
    );

    return c.json({ sessionId, ...result, type: "question" }, 201);
  } catch (err) {
    console.error("发起面试失败", err);
    return c.json({ error: err instanceof Error ? err.message : "发起面试失败" }, 500);
  }
});

// ── POST /api/interview/parse-resume ── 上传简历文件 → 结构化简历（存「我的简历」）
interviewRoutes.post("/parse-resume", async (c) => {
  try {
    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
    if (isAnonymous) return c.json({ error: "请先登录" }, 401);

    const formData = await c.req.formData().catch(() => null);
    const file = formData?.get("file");
    if (!file || !(file instanceof File)) return c.json({ error: "file 必填" }, 400);

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_DOC_SIZE) return c.json({ error: "文件过大（最大 15MB）" }, 413);

    const text = await extractDocumentText(bytes, file.type || "", file.name);
    const { cfgs, extractProvider } = buildRuntime(userId);
    const resumeData = await runWithAIConfig(cfgs, () =>
      runWithUsage({ userId, provider: "platform" }, () =>
        ai.extractResumeData(text, undefined, { userId, provider: extractProvider }),
      ),
    );
    if (!resumeData) return c.json({ error: "简历解析失败，请重试" }, 422);

    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const name = (resumeData as { basic?: { name?: string } }).basic?.name?.trim();
    const title = name ? `${name}的简历` : "上传的简历";
    await db.insert(resumes).values({
      id,
      userId,
      title,
      templateId: "classic",
      data: JSON.stringify(resumeData),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    return c.json({ resumeId: id, title, resumeData }, 201);
  } catch (err) {
    if (err instanceof AttachmentParseError) {
      return c.json({ error: err.message }, err.status as 400 | 413 | 422);
    }
    console.error("简历上传解析失败", err);
    return c.json({ error: err instanceof Error ? err.message : "解析失败" }, 500);
  }
});

// ── POST /api/interview/parse-jd ── 岗位要求（图片或链接）→ 结构化 JD
interviewRoutes.post("/parse-jd", async (c) => {
  try {
    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
    if (isAnonymous) return c.json({ error: "请先登录" }, 401);

    const contentType = c.req.header("content-type") ?? "";
    const { cfgs } = buildRuntime(userId);
    const usageCtx = { userId, provider: "platform" as "platform" | "byok" };

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) return c.json({ error: "file 必填" }, 400);
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length > MAX_IMAGE_SIZE) return c.json({ error: "图片文件过大（最大 10MB）" }, 413);
      const base64 = bytes.toString("base64");
      const mime = file.type || "image/png";
      const jd = await runWithAIConfig(cfgs, () =>
        runWithUsage({ userId, provider: "platform" }, () => parseJobFromImage(base64, mime, usageCtx)),
      );
      if (!jd) return c.json({ error: "未能从图片识别岗位信息，请确保图片清晰" }, 422);
      return c.json({ jd });
    }

    const body = (await c.req.json().catch(() => null)) as { url?: string } | null;
    const url = body?.url?.trim();
    if (!url) return c.json({ error: "url 必填" }, 400);
    const jd = await runWithAIConfig(cfgs, () =>
      runWithUsage({ userId, provider: "platform" }, () => parseJobFromUrl(url, usageCtx)),
    );
    if (!jd) return c.json({ error: "未能从链接识别岗位信息" }, 422);
    return c.json({ jd });
  } catch (err) {
    if (err instanceof AttachmentParseError) {
      return c.json({ error: err.message }, err.status as 400 | 413 | 422);
    }
    console.error("岗位解析失败", err);
    return c.json({ error: err instanceof Error ? err.message : "解析失败" }, 500);
  }
});

// ── GET /api/interview/:id/report ── 评估报告
interviewRoutes.get("/:id/report", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId } = await getAuthUserId(c.req.raw);
    const loaded = loadSession(getDb(), id, userId);
    if (!loaded) return c.json({ error: "面试会话不存在" }, 404);
    if (!loaded.session.report) return c.json({ error: "报告未生成" }, 404);

    const report = safeJsonParse(loaded.session.report) ?? loaded.session.report;
    return c.json({ score: loaded.session.score, report });
  } catch (err) {
    console.error("获取面试报告失败", err);
    return c.json({ error: "获取失败" }, 500);
  }
});

// ── GET /api/interview/:id ── 会话详情
interviewRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId } = await getAuthUserId(c.req.raw);
    const db = getDb();
    const loaded = loadSession(db, id, userId);
    if (!loaded) return c.json({ error: "面试会话不存在" }, 404);

    const rows = loadMessages(db, id);
    return c.json({
      session: loaded.session,
      resumeData: loaded.resumeData,
      jd: loaded.session.jd ? (safeJsonParse(loaded.session.jd) ?? loaded.session.jd) : null,
      messages: rows,
    });
  } catch (err) {
    console.error("获取面试详情失败", err);
    return c.json({ error: "获取失败" }, 500);
  }
});

// ── POST /api/interview/:id/audio ── 上传回答音频（SSE 流式返回下一问文字 + 语音）
interviewRoutes.post("/:id/audio", async (c) => {
  const id = c.req.param("id");
  const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
  if (isAnonymous) return c.json({ error: "请先登录" }, 401);

  const body = (await c.req.json().catch(() => null)) as { audioBase64?: string } | null;
  const audio = (body?.audioBase64 ?? "").replace(/^data:audio\/[^;]+;base64,/, "");
  if (!audio) return c.json({ error: "audioBase64 必填" }, 400);

  const db = getDb();
  const loaded = loadSession(db, id, userId);
  if (!loaded) return c.json({ error: "面试会话不存在" }, 404);
  if (loaded.session.status === "completed") return c.json({ error: "面试已结束" }, 400);

  const { cfgs, chatProvider } = buildRuntime(userId);

  const encoder = new TextEncoder();
  let aborted = false;

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          aborted = true;
        }
      };

      try {
        await runWithAIConfig(cfgs, () =>
          runWithUsage({ userId, provider: "platform" }, async () => {
            const candidateText = await speechToText(audio);
            if (!candidateText) {
              send({ type: "error", message: "未能识别语音内容，请重试" });
              return;
            }

            await db.insert(interviewMessages).values({
              id: crypto.randomUUID(),
              sessionId: id,
              role: "candidate",
              content: candidateText,
              createdAt: new Date().toISOString(),
            });

            const rows = loadMessages(db, id);
            const messages = toTurnMessages(rows);

            const turn = await generateInterviewerTurn(messages, loaded.resumeData, loaded.session.jd, false, {
              userId,
              provider: chatProvider,
            });

            // 先推面试官文字
            send({ type: "text", content: turn.message, done: turn.done });

            // 流式推语音分片，同时累积完整 base64 供存库回放
            const pcmChunks: string[] = [];
            for await (const chunk of textToSpeechChunks(turn.message)) {
              pcmChunks.push(chunk);
              send({ type: "audio", content: chunk });
            }

            await db.insert(interviewMessages).values({
              id: crypto.randomUUID(),
              sessionId: id,
              role: "interviewer",
              content: turn.message,
              audioBase64: pcmChunksToWavBase64(pcmChunks),
              createdAt: new Date().toISOString(),
            });
            await db
              .update(interviewSessions)
              .set({ updatedAt: new Date().toISOString() })
              .where(eq(interviewSessions.id, id));

            send({ type: "done" });
          }),
        );
      } catch (err) {
        console.error("面试音频处理失败", err);
        send({ type: "error", message: err instanceof Error ? err.message : "处理失败" });
      } finally {
        try {
          controller.close();
        } catch {
          // controller 已关闭，忽略
        }
      }
    },
    cancel() {
      aborted = true;
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// ── POST /api/interview/:id/frame ── 上传视频帧
interviewRoutes.post("/:id/frame", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
    if (isAnonymous) return c.json({ error: "请先登录" }, 401);

    const body = (await c.req.json().catch(() => null)) as { frameBase64?: string; mimeType?: string } | null;
    const frame = (body?.frameBase64 ?? "").replace(/^data:image\/[^;]+;base64,/, "");
    if (!frame) return c.json({ error: "frameBase64 必填" }, 400);

    const db = getDb();
    const loaded = loadSession(db, id, userId);
    if (!loaded) return c.json({ error: "面试会话不存在" }, 404);

    const { cfgs, chatProvider } = buildRuntime(userId);
    const analysis = await runWithAIConfig(cfgs, () =>
      runWithUsage({ userId, provider: "platform" }, () =>
        analyzeFrame(frame, body?.mimeType ?? "image/jpeg", { userId, provider: chatProvider }),
      ),
    );

    const [latest] = db
      .select()
      .from(interviewMessages)
      .where(and(eq(interviewMessages.sessionId, id), eq(interviewMessages.role, "candidate")))
      .orderBy(desc(interviewMessages.createdAt))
      .limit(1)
      .all();

    if (latest) {
      const existing = safeJsonParse<FrameAnalysis[]>(latest.nonVerbal ?? "") ?? [];
      existing.push(analysis);
      await db
        .update(interviewMessages)
        .set({ nonVerbal: JSON.stringify(existing) })
        .where(eq(interviewMessages.id, latest.id));
    }

    return c.json({ ok: true, analysis });
  } catch (err) {
    console.error("视频帧分析失败", err);
    return c.json({ error: err instanceof Error ? err.message : "分析失败" }, 500);
  }
});

// ── POST /api/interview/:id/complete ── 结束面试并生成报告
interviewRoutes.post("/:id/complete", async (c) => {
  try {
    const id = c.req.param("id");
    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
    if (isAnonymous) return c.json({ error: "请先登录" }, 401);

    const db = getDb();
    const loaded = loadSession(db, id, userId);
    if (!loaded) return c.json({ error: "面试会话不存在" }, 404);

    if (loaded.session.status === "completed" && loaded.session.report) {
      return c.json({ score: loaded.session.score, report: safeJsonParse(loaded.session.report) ?? loaded.session.report });
    }

    const rows = loadMessages(db, id);
    const messages = toTurnMessages(rows);
    if (messages.filter((m) => m.role === "candidate").length === 0) {
      return c.json({ error: "尚未有问答记录，无法生成报告" }, 400);
    }

    const nonVerbalSummary = buildNonVerbalSummary(rows);
    const { cfgs, chatProvider } = buildRuntime(userId);

    const report = await runWithAIConfig(cfgs, () =>
      runWithUsage({ userId, provider: "platform" }, () =>
        generateInterviewReport(messages, loaded.resumeData, loaded.session.jd, nonVerbalSummary, {
          userId,
          provider: chatProvider,
        }),
      ),
    );

    await db
      .update(interviewSessions)
      .set({ status: "completed", score: report.score, report: JSON.stringify(report), updatedAt: new Date().toISOString() })
      .where(eq(interviewSessions.id, id));

    return c.json(report);
  } catch (err) {
    console.error("生成面试报告失败", err);
    return c.json({ error: err instanceof Error ? err.message : "生成报告失败" }, 500);
  }
});
