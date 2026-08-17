/**
 * 对话路由 — AI 对话（SSE）、历史、消息、开场白、附件解析、简历提取。
 */

import { Hono } from "hono";
import { ai, openai, DEFAULT_MODEL, runWithAIConfig, currentChatClient, currentChatModel, type RuntimeAiConfigs } from "../lib/ai";
import { SYSTEM_PROMPT, GREETING_NEW_USER } from "../lib/ai/prompts";
import {
  parseAttachmentFile,
  parseAttachmentUrl,
  AttachmentParseError,
} from "../lib/ai/attachment-parser";
import { getDb } from "../db";
import { conversations, messages, resumes } from "../db/schema";
import { resumeDataSchema } from "../lib/resume.schema";
import { getAuthUserId, buildAnonymousCookie, ANON_COOKIE } from "../lib/auth/utils";
import { checkRateLimit, getRateLimitKey } from "../lib/rate-limit";
import { eq, asc, and, desc } from "drizzle-orm";
import { streamAgent } from "../lib/ai/graph";
import { TraceCollector } from "../lib/observability/collector";
import { runWithTrace } from "../lib/observability/context";
import { persistTraceFireAndForget } from "../lib/observability/persist";
import { recordUsage } from "../lib/billing/ledger";
import { getUserAiConfigs, type AiScope } from "../lib/billing/byok";

export const chatRoutes = new Hono();

// 环境变量控制：启用 LangGraph Agent 模式
const USE_LANGGRAPH = process.env.LANGGRAPH_ENABLED === "true";

// 从 LangChain AIMessage.content 提取纯文本（可能是 string 或 content block 数组）
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return "";
      })
      .join("");
  }
  return "";
}

// 从 LangChain model end 事件的 output 提取 token usage（兼容 usage_metadata / response_metadata）
function extractTokenUsage(output: unknown): { input: number; output: number; total: number } | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  const usageMeta = o.usage_metadata as Record<string, unknown> | undefined;
  if (usageMeta) {
    const input = Number(usageMeta.input_tokens ?? 0);
    const outputTokens = Number(usageMeta.output_tokens ?? 0);
    return { input, output: outputTokens, total: Number(usageMeta.total_tokens ?? input + outputTokens) };
  }

  const respMeta = o.response_metadata as Record<string, unknown> | undefined;
  const tokenUsage = respMeta?.tokenUsage as Record<string, unknown> | undefined;
  if (tokenUsage) {
    const input = Number(tokenUsage.prompt_tokens ?? 0);
    const outputTokens = Number(tokenUsage.completion_tokens ?? 0);
    return { input, output: outputTokens, total: Number(tokenUsage.total_tokens ?? input + outputTokens) };
  }

  return null;
}

// ── POST /api/chat ──
// 两种请求形态：
//  1. JSON（原链路）：{ conversationId?, message, resumeData? }
//  2. multipart/form-data（带附件）：message + files[] + urls[]
//     → 发送时才解析：在流式开始前并行解析全部附件并拼装消息
chatRoutes.post("/", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  let conversationId: string | undefined;
  let message = "";
  let resumeData: Record<string, unknown> | undefined;
  let attachmentInputs: Array<{ kind: "file"; file: File } | { kind: "url"; url: string }> = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData().catch(() => null);
    if (!formData) {
      return new Response(JSON.stringify({ error: "Invalid form data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    message = String(formData.get("message") ?? "").trim();
    const files = formData.getAll("files").filter((f) => typeof f !== "string" && f instanceof File) as File[];
    const urls = formData.getAll("urls").map((u) => String(u).trim()).filter(Boolean);
    for (const f of files) attachmentInputs.push({ kind: "file", file: f });
    for (const u of urls) attachmentInputs.push({ kind: "url", url: u });
  } else {
    let body: { conversationId?: string; message: string; resumeData?: Record<string, unknown> };
    try {
      body = await c.req.json() as { conversationId?: string; message: string; resumeData?: Record<string, unknown> };
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    conversationId = body.conversationId;
    message = typeof body.message === "string" ? body.message.trim() : "";
    resumeData = body.resumeData;
  }

  if (!message && attachmentInputs.length === 0) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (attachmentInputs.length > 5) {
    return new Response(JSON.stringify({ error: "最多同时发送 5 个附件" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();

    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);

    // BYOK：按 scope 解析用户配置（chat/extract/vision），本次请求对应调用走用户 key
    const userCfgs = getUserAiConfigs(userId);
    const toRuntime = (scope: AiScope) => {
      const c = userCfgs[scope];
      return c ? { baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model } : null;
    };
    const chatCfg = toRuntime("chat");
    const extractCfg = toRuntime("extract");
    const visionCfg = toRuntime("vision");
    const runtimeCfgs: RuntimeAiConfigs = {};
    if (chatCfg) runtimeCfgs.chat = chatCfg;
    if (extractCfg) runtimeCfgs.extract = extractCfg;
    if (visionCfg) runtimeCfgs.vision = visionCfg;
    const chatProvider: "platform" | "byok" = chatCfg ? "byok" : "platform";

    const rlKey = getRateLimitKey(c.req.raw);
    const rl = checkRateLimit(rlKey, isAnonymous ? 10 : 30);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "请求过于频繁，请稍后再试" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfter ?? 60),
          },
        },
      );
    }

    // ── 解析附件（并行；输入不合格直接 4xx，此时尚无任何对话副作用）──
    let finalMessage = message;
    if (attachmentInputs.length > 0) {
      try {
        const parsed = await runWithAIConfig(runtimeCfgs, () =>
          Promise.all(
            attachmentInputs.map(async (att) => {
              const result =
                att.kind === "url"
                  ? await parseAttachmentUrl(att.url, { userId, provider: extractCfg ? "byok" : "platform" })
                  : await parseAttachmentFile(att.file, { userId, provider: extractCfg ? "byok" : "platform" });
              const name = att.kind === "url" ? att.url.slice(0, 60) : att.file.name;
              return { ...result, name };
            }),
          ),
        );
        const multi = parsed.length > 1;
        const blocks = parsed.map((p, i) => {
          const label = p.kind === "job" ? "岗位要求" : "简历";
          const header = multi
            ? `【附件 ${i + 1} · ${label}：${p.name}】`
            : `【${label}：${p.name}】`;
          return `${header}\n${p.formatted}`;
        });
        const attachmentText = blocks.join("\n\n");
        finalMessage = message ? `${attachmentText}\n\n${message}` : attachmentText;
      } catch (err) {
        if (err instanceof AttachmentParseError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: err.status,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw err;
      }
    }

    let convId = conversationId;
    if (convId) {
      const existing = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))
        .limit(1);
      if (existing.length === 0) {
        convId = undefined;
      }
    }

    // 匿名用户限制：最多 5 个对话
    if (!convId && isAnonymous) {
      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .limit(5);
      if (rows.length >= Number(process.env.ANON_LIMIT || 5)) {
        return new Response(
          JSON.stringify({ error: "limit_reached", message: "未登录用户最多创建5个对话，请登录后继续使用" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (!convId) {
      convId = crypto.randomUUID();
      await db.insert(conversations).values({
        id: convId,
        userId,
        title: "新对话",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(messages).values({
        id: crypto.randomUUID(),
        conversationId: convId,
        role: "assistant",
        content: GREETING_NEW_USER,
        createdAt: now,
      });
    } else {
      await db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, convId));
    }

    const collector = new TraceCollector({
      conversationId: convId,
      userId,
      input: finalMessage,
    });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(asc(messages.createdAt));

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = USE_LANGGRAPH
      ? []
      : [{ role: "system", content: SYSTEM_PROMPT }];
    for (const msg of history.slice(-30)) {
      if (msg.role === "user" || msg.role === "assistant") {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }
    chatMessages.push({ role: "user", content: finalMessage });

    const userMsgSaved = db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "user",
      content: finalMessage,
      createdAt: now,
    });

    const encoder = new TextEncoder();
    let fullReply = "";
    let currentRunId: string | null = null;
    let runText = "";

    let aborted = false;
    let saved = false;

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

        const chainStarts = new Map<string, { node: string; ts: number }>();
        const modelStarts = new Map<string, { model: string; node?: string; ts: number }>();
        const toolStarts = new Map<string, { name: string; ts: number }>();

        try {
          // BYOK：本次请求内所有 AI 调用（worker/提取工具/标题/回退）按 scope 注入用户配置
          await runWithAIConfig(runtimeCfgs, () =>
            runWithTrace(collector, async () => {
            await userMsgSaved;

            if (USE_LANGGRAPH) {
              const agentInput = chatMessages.filter(
                (m): m is { role: "user" | "assistant" | "system"; content: string } =>
                  m.role === "user" || m.role === "assistant" || m.role === "system",
              );

              for await (const event of streamAgent({ messages: agentInput, resumeData, aiConfig: chatCfg ?? undefined })) {
                const runId = (event as { run_id?: string }).run_id;
                const meta = (event as unknown as { metadata?: { langgraph_node?: string; ls_model_name?: string } }).metadata;

                switch (event.event) {
                  case "on_chain_start": {
                    const name = event.name;
                    if (runId && (name === "router" || name === "worker" || name === "tools")) {
                      chainStarts.set(runId, { node: name, ts: Date.now() });
                    }
                    break;
                  }
                  case "on_chain_end": {
                    if (runId) {
                      const start = chainStarts.get(runId);
                      if (start) {
                        collector.addSpan({
                          type: "node",
                          name: start.node,
                          node: start.node,
                          durationMs: Date.now() - start.ts,
                          status: "success",
                        });
                        chainStarts.delete(runId);
                      }
                    }
                    if (event.name === "router") {
                      const out = event.data?.output as { mode?: string } | undefined;
                      if (out?.mode) collector.mode = out.mode;
                    }
                    break;
                  }
                  case "on_chat_model_start": {
                    const model = meta?.ls_model_name ?? "unknown";
                    if (runId) {
                      modelStarts.set(runId, { model, node: meta?.langgraph_node, ts: Date.now() });
                    }
                    // 记录 Worker 实际模型（Router 只是分类，非主回复模型）
                    if (!collector.model || meta?.langgraph_node === "worker") {
                      collector.model = model;
                    }
                    break;
                  }
                  case "on_chat_model_stream": {
                    if (meta?.langgraph_node === "router") break;
                    if (runId && runId !== currentRunId) {
                      currentRunId = runId;
                      runText = "";
                    }
                    const content = event.data?.chunk?.content;
                    if (content) {
                      if (!fullReply && !runText && !content.trim()) break;
                      runText += content;
                      send({ content, conversationId: convId });
                    }
                    break;
                  }
                  case "on_chat_model_end": {
                    const node = meta?.langgraph_node;
                    const output = event.data?.output;
                    const usage = extractTokenUsage(output);
                    if (runId) {
                      const start = modelStarts.get(runId);
                      if (start) {
                        collector.addSpan({
                          type: "model",
                          name: start.node ?? "model",
                          node: start.node,
                          model: start.model,
                          tokens: usage?.total ?? 0,
                          durationMs: Date.now() - start.ts,
                          status: "success",
                        });
                        modelStarts.delete(runId);
                      }
                    }
                    if (usage) {
                      collector.totalTokens += usage.total;
                      // 用量账本：router / worker 各自记账（userId 从 collector 解析；router 恒平台，worker 随 BYOK）
                      recordUsage({
                        model: meta?.ls_model_name ?? "unknown",
                        inputTokens: usage.input,
                        outputTokens: usage.output,
                        source: node === "router" ? "router" : "chat",
                        provider: node === "router" ? "platform" : chatProvider,
                      });
                    }
                    if (node === "router") break;
                    const toolCalls = output?.tool_calls;
                    if (toolCalls && toolCalls.length > 0) {
                      runText = "";
                      for (const tc of toolCalls) {
                        send({
                          tool_call: { name: tc.name, args: tc.args },
                          conversationId: convId,
                        });
                      }
                    } else if (runText) {
                      fullReply += runText;
                      runText = "";
                    } else {
                      // workerNode 用 model.invoke()（非流式），不会触发 on_chat_model_stream，
                      // 这里从完整输出兜底提取 Worker 的文本回复
                      const text = extractTextContent(output?.content);
                      if (text) {
                        fullReply += text;
                        send({ content: text, conversationId: convId });
                      }
                    }
                    break;
                  }
                  case "on_tool_start": {
                    if (runId) toolStarts.set(runId, { name: event.name, ts: Date.now() });
                    break;
                  }
                  case "on_tool_end": {
                    if (runId) {
                      const start = toolStarts.get(runId);
                      if (start) {
                        collector.addSpan({
                          type: "tool",
                          name: start.name,
                          durationMs: Date.now() - start.ts,
                          status: "success",
                        });
                        toolStarts.delete(runId);
                      }
                    }
                    if (meta?.langgraph_node === "router") break;
                    if (event.name === "extractResume") {
                      const raw = event.data?.output;
                      if (typeof raw === "string") {
                        try {
                          const parsed = JSON.parse(raw);
                          send({ resumeData: parsed, conversationId: convId });
                        } catch {
                          send({ error: "简历数据解析失败" });
                        }
                      }
                    }
                    break;
                  }
                  case "on_llm_error":
                  case "on_tool_error":
                  case "on_chain_error": {
                    const errData = (event as unknown as { data?: { error?: unknown } }).data?.error;
                    const msg =
                      errData instanceof Error ? errData.message
                      : typeof errData === "string" ? errData
                      : JSON.stringify(errData ?? "unknown error");
                    collector.addEvent({ type: "error", name: event.event, detail: { node: event.name, error: msg } });
                    if (/timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(msg)) {
                      collector.addEvent({ type: "degradation", name: "llm_timeout", detail: { node: event.name } });
                    }
                    break;
                  }
                }
              }
            } else {
              const t0 = Date.now();
              const stream = await ai.chat(chatMessages);
              collector.model = DEFAULT_MODEL;

              let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
              for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                  if (!fullReply && !content.trim()) continue;
                  fullReply += content;
                  send({ content, conversationId: convId });
                }
                if (chunk.usage) usage = chunk.usage; // include_usage：最后一个 chunk 携带 usage
              }
              if (usage) {
                collector.totalTokens += usage.prompt_tokens + usage.completion_tokens;
                recordUsage({
                  model: currentChatModel(),
                  inputTokens: usage.prompt_tokens,
                  outputTokens: usage.completion_tokens,
                  source: "chat",
                  provider: chatProvider,
                });
              }
              collector.addSpan({
                type: "model",
                name: "ai.chat",
                model: currentChatModel(),
                durationMs: Date.now() - t0,
                status: "success",
              });
            }

            if (fullReply) {
              const savePromise = db.insert(messages).values({
                id: crypto.randomUUID(),
                conversationId: convId!,
                role: "assistant",
                content: fullReply,
                createdAt: new Date().toISOString(),
              }).then(() => { saved = true; });

              let titlePromise: Promise<unknown> = Promise.resolve();
              if (history.length === 0) {
                titlePromise = currentChatClient().chat.completions.create({
                  model: currentChatModel(),
                  temperature: 0.3,
                  max_tokens: 30,
                  messages: [
                    { role: "system", content: "根据用户和AI的第一轮对话，生成一个简短的对话标题（8字以内）。只返回标题文本。" },
                    { role: "user", content: `用户: ${finalMessage.slice(0, 300)}\nAI: ${fullReply.slice(0, 200)}` },
                  ],
                }).then(async (titleRes) => {
                  const title = titleRes.choices[0]?.message?.content?.trim()?.replace(/["「」""]/g, "") ?? "新对话";
                  await db.update(conversations).set({ title: title.slice(0, 20) }).where(eq(conversations.id, convId!));
                  send({ title: title.slice(0, 20) });
                  recordUsage({
                    model: currentChatModel(),
                    inputTokens: titleRes.usage?.prompt_tokens ?? 0,
                    outputTokens: titleRes.usage?.completion_tokens ?? 0,
                    source: "title",
                    conversationId: convId!,
                    provider: chatProvider,
                  });
                }).catch(() => { /* 标题生成失败不影响对话 */ });
              }

              await Promise.all([savePromise.catch((e: unknown) => console.error("Failed to save AI reply:", e)), titlePromise]);
            }
          }));

          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // 客户端已断开，controller 已关闭，无需处理
          }
        } catch (err) {
          collector.errorMessage = err instanceof Error ? err.message : "Unknown error";
          if (!aborted) {
            console.error("Stream error:", err);
            send({ error: "AI 回复出错，请重试" });
          }
          if (fullReply && !saved) {
            try {
              await db.insert(messages).values({
                id: crypto.randomUUID(),
                conversationId: convId!,
                role: "assistant",
                content: fullReply,
                createdAt: new Date().toISOString(),
              });
              saved = true;
            } catch (e) {
              console.error("Failed to save partial AI reply:", e);
            }
          }
          try {
            controller.close();
          } catch {
            // controller 已关闭，忽略
          }
        } finally {
          collector.output = fullReply;
          persistTraceFireAndForget(collector);
        }
      },
      cancel() {
        aborted = true;
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };
    if (isAnonymous) {
      headers["Set-Cookie"] = `${ANON_COOKIE}=${userId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;
    }

    return new Response(readable, { headers });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "服务器错误" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

// ── GET /api/chat/history ──
chatRoutes.get("/history", async (c) => {
  const db = getDb();
  const { userId, isAnonymous } = await getAuthUserId(c.req.raw);

  const conversationId = c.req.query("conversationId");

  if (conversationId) {
    const conv = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
      .limit(1);

    if (conv.length === 0) {
      return c.json({ messages: [] });
    }

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    return c.json(
      { messages: msgs },
      200,
      isAnonymous ? { "Set-Cookie": buildAnonymousCookie(userId) } : undefined,
    );
  }

  const list = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);

  return c.json(
    { conversations: list },
    200,
    isAnonymous ? { "Set-Cookie": buildAnonymousCookie(userId) } : undefined,
  );
});

// ── PATCH /api/chat/history/:id ──
chatRoutes.patch("/history/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as { title?: string };
  if (!body.title?.trim()) {
    return c.json({ error: "title is required" }, 400);
  }

  const { userId } = await getAuthUserId(c.req.raw);
  const db = getDb();

  const result = await db
    .update(conversations)
    .set({ title: body.title.trim(), updatedAt: new Date().toISOString() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning();

  if (!result.length) {
    return c.json({ error: "对话不存在" }, 404);
  }

  return c.json({ ok: true });
});

// ── DELETE /api/chat/history/:id ──
chatRoutes.delete("/history/:id", async (c) => {
  const id = c.req.param("id");
  const { userId } = await getAuthUserId(c.req.raw);
  const db = getDb();

  const conv = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);

  if (conv.length === 0) {
    return c.json({ error: "对话不存在" }, 404);
  }

  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return c.json({ ok: true });
});

// ── DELETE /api/chat/messages/:id ──
chatRoutes.delete("/messages/:id", async (c) => {
  const id = c.req.param("id");
  const { userId } = await getAuthUserId(c.req.raw);
  const db = getDb();

  const msg = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1);

  if (msg.length === 0) {
    return c.json({ error: "消息不存在" }, 404);
  }

  const conv = await db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.id, msg[0].conversationId),
      eq(conversations.userId, userId),
    ))
    .limit(1);

  if (conv.length === 0) {
    return c.json({ error: "无权操作" }, 403);
  }

  await db.delete(messages).where(eq(messages.id, id));

  return c.json({ ok: true });
});

// ── GET /api/chat/greeting ──（静态开场白，不再实时生成）
chatRoutes.get("/greeting", async (c) => {
  const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
  return c.json(
    { greeting: GREETING_NEW_USER },
    200,
    isAnonymous ? { "Set-Cookie": buildAnonymousCookie(userId) } : undefined,
  );
});

// ── POST /api/chat/greeting ──（创建对话并写入静态开场白）
chatRoutes.post("/greeting", async (c) => {
  try {
    const db = getDb();
    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);

    if (isAnonymous) {
      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .limit(5);
      if (rows.length >= Number(process.env.ANON_LIMIT || 5)) {
        return c.json(
          { error: "limit_reached", message: "未登录用户最多创建5个对话，请登录后继续使用" },
          403,
        );
      }
    }

    const now = new Date().toISOString();
    const conversationId = crypto.randomUUID();
    await db.insert(conversations).values({
      id: conversationId,
      userId,
      title: "新对话",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId,
      role: "assistant",
      content: GREETING_NEW_USER,
      createdAt: now,
    });

    return c.json(
      { conversationId, greeting: GREETING_NEW_USER },
      200,
      isAnonymous ? { "Set-Cookie": buildAnonymousCookie(userId) } : undefined,
    );
  } catch (err) {
    console.error("Greeting API error:", err);
    return c.json({ error: "创建对话失败" }, 500);
  }
});

// ── POST /api/chat/resume ── 聊天生成的简历同步到「我的简历」（联动）
// 对话已有关联简历（conversations.resumeId）→ 更新数据并升版本；
// 没有 → 新建简历并回填 resumeId。前端在每次提取合并完成后调用。
chatRoutes.post("/resume", async (c) => {
  const body = await c.req.json().catch(() => null) as { conversationId?: string; data?: unknown } | null;
  const conversationId = String(body?.conversationId ?? "").trim();
  if (!conversationId || !body?.data) {
    return c.json({ error: "conversationId 和 data 必填" }, 400);
  }

  const db = getDb();
  const { userId } = await getAuthUserId(c.req.raw);

  const [conv] = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)
    .all();
  if (!conv) return c.json({ error: "对话不存在" }, 404);

  let parsed: ReturnType<typeof resumeDataSchema.parse>;
  try {
    parsed = resumeDataSchema.parse(body.data);
  } catch {
    return c.json({ error: "简历数据不合法" }, 400);
  }

  const now = new Date().toISOString();

  // 已有关联简历 → 更新（版本 +1）
  if (conv.resumeId) {
    const [existing] = db.select().from(resumes).where(eq(resumes.id, conv.resumeId)).limit(1).all();
    if (existing) {
      db.update(resumes)
        .set({ data: JSON.stringify(parsed), version: existing.version + 1, updatedAt: now })
        .where(eq(resumes.id, conv.resumeId))
        .run();
      return c.json({ ok: true, resumeId: conv.resumeId, version: existing.version + 1, created: false });
    }
    // resumeId 指向的简历已被删除 → 走新建分支重建
  }

  // 新建简历并回填对话关联
  const name = typeof parsed.basic?.name === "string" && parsed.basic.name.trim()
    ? `${parsed.basic.name.trim()}的简历`
    : (conv.title && conv.title !== "新对话" ? conv.title : "我的简历");
  const resumeId = crypto.randomUUID();
  db.insert(resumes)
    .values({
      id: resumeId,
      userId,
      title: name,
      templateId: "classic",
      data: JSON.stringify(parsed),
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.update(conversations).set({ resumeId }).where(eq(conversations.id, conversationId)).run();

  return c.json({ ok: true, resumeId, version: 1, created: true });
});

// ── POST /api/chat/extract ──
chatRoutes.post("/extract", async (c) => {
  let conversationId: string;
  let resumeData: Record<string, unknown> | undefined;
  try {
    const body = await c.req.json() as { conversationId?: string; resumeData?: Record<string, unknown> };
    if (!body.conversationId) {
      return c.json({ error: "conversationId is required" }, 400);
    }
    conversationId = body.conversationId;
    resumeData = body.resumeData ?? undefined;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const db = getDb();
  // 用量记账：提取在独立路由（无 trace collector），显式传入用户身份
  const { userId } = await getAuthUserId(c.req.raw);
  const userExtractCfg = getUserAiConfigs(userId).extract;
  const extractRuntimeCfg = userExtractCfg
    ? { baseUrl: userExtractCfg.baseUrl, apiKey: userExtractCfg.apiKey, model: userExtractCfg.model }
    : null;

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  if (history.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const conversationText = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `[${m.role === "user" ? "用户" : "顾问"}]: ${m.content}`)
    .join("\n\n");

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
        send({ type: "connecting" });

        const stream = await runWithAIConfig(extractRuntimeCfg ? { extract: extractRuntimeCfg } : null, () =>
          ai.extractResumeDataStream(conversationText, resumeData, {
            userId,
            conversationId,
            provider: extractRuntimeCfg ? "byok" : "platform",
          }),
        );
        const reader = stream.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (aborted) continue;
          try {
            controller.enqueue(value);
          } catch {
            aborted = true;
          }
        }
      } catch (err) {
        console.error("[extract] 失败:", err instanceof Error ? err.message : err);
        send({ type: "error", message: err instanceof Error ? err.message : "提取失败" });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
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

// ── POST /api/chat/parse-attachment ──
// 旧接口保留向后兼容，内部复用公共解析函数（与 /api/chat multipart 同源）。
// 用量记账：附件解析是独立路由，显式传用户身份。
chatRoutes.post("/parse-attachment", async (c) => {
  try {
    const contentType = c.req.header("content-type") ?? "";
    const { userId } = await getAuthUserId(c.req.raw);
    const userCfgs = getUserAiConfigs(userId);
    const extractUserCfg = userCfgs.extract;
    const visionUserCfg = userCfgs.vision;
    const extractCfg = extractUserCfg
      ? { baseUrl: extractUserCfg.baseUrl, apiKey: extractUserCfg.apiKey, model: extractUserCfg.model }
      : null;
    const visionCfg = visionUserCfg
      ? { baseUrl: visionUserCfg.baseUrl, apiKey: visionUserCfg.apiKey, model: visionUserCfg.model }
      : null;
    const runtimeCfgs = extractCfg || visionCfg
      ? { extract: extractCfg ?? undefined, vision: visionCfg ?? undefined }
      : null;
    const usageCtx = { userId, provider: (extractCfg ? "byok" : "platform") as "platform" | "byok" };

    // ── URL 模式 ──
    if (contentType.includes("application/json")) {
      const body = await c.req.json() as { url?: string };
      const url = body.url?.trim();
      if (!url) {
        return c.json({ error: "url is required" }, 400);
      }
      const parsed = await runWithAIConfig(runtimeCfgs, () => parseAttachmentUrl(url, usageCtx));
      return c.json({ type: "job", formatted: parsed.formatted });
    }

    // ── 文件模式（multipart/form-data）──
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }

    const parsed = await runWithAIConfig(runtimeCfgs, () => parseAttachmentFile(file, usageCtx));
    return c.json({ type: parsed.kind, formatted: parsed.formatted });
  } catch (err) {
    if (err instanceof AttachmentParseError) {
      return c.json({ error: err.message }, err.status as 400 | 413 | 422);
    }
    console.error("[parse-attachment] Error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "服务器错误" },
      500,
    );
  }
});
