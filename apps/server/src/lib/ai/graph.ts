/**
 * LangGraph Agent — 2-Agent 简历顾问对话图
 *
 * Router (glm-4-flash): 快速分类用户意图 → 选择 mode
 * Worker (glm-4-plus):  根据 mode 加载对应提示词，执行工具 + 生成回复
 *
 * 图结构: __start__ → router → worker ↔ tools → __end__
 */

import { StateGraph, Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, AIMessageChunk, SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { AGENT_TOOLS, getToolsForMode } from "./tools";
import { ROUTER_PROMPT, WORKER_PROMPTS, OFFTOPIC_REPLIES, PLATFORM_BOUNDARY_RULE } from "./prompts";
import { RESUME_KNOWLEDGE_BASE } from "./knowledge";
import { vectorStore } from "./vectorstore";
import { embedTexts } from "./embeddings";
import { recordDegradation } from "../observability/context";

// ── 知识库初始化（懒加载，只执行一次）──

let knowledgeInitPromise: Promise<void> | null = null;

async function ensureKnowledgeBase(): Promise<void> {
  if (vectorStore.size > 0) return;
  if (knowledgeInitPromise) return knowledgeInitPromise;

  knowledgeInitPromise = (async () => {
    try {
      const contents = RESUME_KNOWLEDGE_BASE.map((k) => k.content);
      const vectors = await embedTexts(contents);
      const metadatas = RESUME_KNOWLEDGE_BASE.map((k) => ({
        category: k.category,
        content: k.content,
      }));
      vectorStore.add(vectors, metadatas);
      console.log(`[VectorStore] 知识库初始化完成，共 ${vectorStore.size} 条`);
    } catch (err) {
      console.error("[VectorStore] 知识库初始化失败:", err);
      knowledgeInitPromise = null;
      throw err;
    }
  })();

  return knowledgeInitPromise;
}

// ── 状态定义 ──

const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 已推送的表单（防重复）
  formsPushed: Annotation<string[]>({
    reducer: (current, update) => [...new Set([...(current ?? []), ...(update ?? [])])],
    default: () => [],
  }),

  // 客户端当前简历数据（extractResume 工具做增量提取用）
  resumeData: Annotation<Record<string, unknown> | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  // BYOK：用户自带 API 配置（主对话 worker 走用户 key，无配置回落平台）
  aiConfig: Annotation<{ baseUrl: string; apiKey: string; model: string } | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  // Router 分类结果
  mode: Annotation<"chatting" | "collecting" | "advising" | "extracting" | "offtopic">({
    reducer: (_, update) => update,
    default: () => "chatting",
  }),

  // Router 给 Worker 的一句简短指令
  routerInstruction: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // 安全计数器：防止 tool calling 死循环
  iterationCount: Annotation<number>({
    reducer: (current, update) => (current ?? 0) + (update ?? 0),
    default: () => 0,
  }),
});

type GraphStateType = typeof GraphState.State;

// ── 常量 ──

const MAX_ITERATIONS = 8;

// ── Router 辅助：消息文本提取 / 截断 / 关键词兜底分类 ──

function messageText(m: BaseMessage): string {
  const c = m.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) =>
        typeof p === "string" ? p : p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "",
      )
      .join("");
  }
  return "";
}

/** 截断长消息，避免长上下文（简历摘要、长回复）让 glm-4-flash 崩溃输出文本 */
function truncateMessage(m: BaseMessage, maxLen: number): BaseMessage {
  const text = messageText(m);
  if (text.length <= maxLen) return m;
  const half = Math.floor(maxLen / 2);
  const truncated = text.slice(0, half) + "\n…(中间省略)…\n" + text.slice(-half);
  const type = (m as unknown as { _getType?: () => string })._getType?.() ?? "human";
  if (type === "system") return new SystemMessage(truncated);
  if (type === "ai") return new AIMessage(truncated);
  return new HumanMessage(truncated);
}

/** router 输出非 JSON 时的关键词兜底分类（不再一律 fallback 到 collecting） */
function classifyByKeywords(text: string, hasResume: boolean): { mode: "chatting" | "collecting" | "advising" | "extracting"; instruction: string } {
  if (/demo|示例|样例|模板|例子|简历示例|案例简历/i.test(text)) {
    return { mode: "extracting", instruction: "生成示例简历" };
  }
  if (/生成简历|帮我生成|可以了|差不多了|确认生成|出简历/.test(text)) {
    return { mode: "extracting", instruction: "确认生成简历" };
  }
  if (hasResume && /优化|润色|改写|怎么写|更改|重构|重写|整理|重新写|帮我改|继续|还有|其他项目|其他经历|更多/.test(text)) {
    return { mode: "advising", instruction: "基于简历优化" };
  }
  if (/优化|润色|改写|怎么写好/.test(text)) {
    return { mode: "advising", instruction: "润色优化" };
  }
  if (/你好|您好|hi|hello|在吗|谢谢|能做什么|你是谁/.test(text)) {
    return { mode: "chatting", instruction: "闲聊" };
  }
  return { mode: "collecting", instruction: "收集信息" };
}

// ── 获取模型 ──

function getRouterModel() {
  return new ChatOpenAI({
    model: process.env.ROUTER_MODEL ?? "glm-4-flash",
    temperature: 0.1,
    maxTokens: 128,
    timeout: 30_000,
    modelKwargs: {
      response_format: { type: "json_object" },
    },
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
  });
}

function getWorkerModel(mode?: string, userCfg?: { baseUrl: string; apiKey: string; model: string }) {
  // BYOK：用户配置了自己的 API 时，主对话模型走用户 key（router 仍留平台侧分类）
  if (userCfg) {
    return new ChatOpenAI({
      model: userCfg.model,
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 90_000,
      apiKey: userCfg.apiKey,
      configuration: {
        baseURL: userCfg.baseUrl,
      },
    });
  }

  // chatting/collecting 是高频模式，用快模型；advising/extracting 用质量模型
  const needsQuality = mode === "advising" || mode === "extracting";
  const model = needsQuality
    ? (process.env.AI_MODEL ?? "gpt-4o-mini")
    : (process.env.ROUTER_MODEL ?? "glm-4-flash");

  return new ChatOpenAI({
    model,
    temperature: 0.7,
    maxTokens: needsQuality ? 4096 : 2048,
    // 质量模型（glm-4-plus）推理较慢给 90s，快模型给 45s，避免上游挂起卡死对话
    timeout: needsQuality ? 90_000 : 45_000,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
  });
}

// ── Router 节点 ──

async function routerNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const t0 = Date.now();
  const model = getRouterModel();

  // 极简输入：router 只看到「是否已上传简历」信号 + 最新一条消息。
  // 历史消息（简历摘要、长回复）会让 glm-4-flash 崩溃输出文本而非 JSON。
  const msgs = state.messages ?? [];
  const hasResume = msgs.some((m) => messageText(m).includes("[用户上传了简历文件]"));
  const latestText = msgs.length > 0 ? messageText(msgs[msgs.length - 1]) : "";

  const routerMsgs: BaseMessage[] = [
    new SystemMessage(ROUTER_PROMPT),
    new SystemMessage(`已上传简历: ${hasResume ? "是" : "否"}`),
  ];
  if (latestText) {
    routerMsgs.push(truncateMessage(msgs[msgs.length - 1], 500));
  }

  const response = await model.invoke(routerMsgs, { signal: AbortSignal.timeout(15_000) });
  console.log(`[Router] invoke 耗时 ${Date.now() - t0}ms`);

  const content = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  console.log(`[Router] 原始输出: ${content.slice(0, 200)}`);

  const validModes = ["chatting", "collecting", "advising", "extracting", "offtopic"];

  try {
    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    const rawMode = parsed.mode;
    const mode = validModes.includes(rawMode) ? rawMode : "collecting";
    if (mode !== rawMode) {
      recordDegradation("illegal_mode", { mode: rawMode });
    }
    const instruction = typeof parsed.instruction === "string" ? parsed.instruction : "";
    console.log(`[Router] → ${mode} | ${instruction}`);
    return { mode, routerInstruction: instruction };
  } catch {
    console.warn("[Router] JSON 解析失败，fallback → 关键词分类");
    recordDegradation("router_json_fallback");
    const fallback = classifyByKeywords(latestText, hasResume);
    return { mode: fallback.mode, routerInstruction: fallback.instruction };
  }
}

// ── Worker 节点 ──

async function workerNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  ensureKnowledgeBase().catch(() => {
    recordDegradation("knowledge_init_failed");
  });

  // 安全检查
  if ((state.iterationCount ?? 0) >= MAX_ITERATIONS) {
    recordDegradation("iteration_limit", { count: state.iterationCount });
    return {
      messages: [
        new AIMessage({
          content: "好的，我这边已经处理了不少信息。咱们先看看目前的成果，有什么需要调整的你随时告诉我。",
        }),
      ],
      iterationCount: 0,
    };
  }

  // offtopic 能走到 worker 的只有 BYOK 用户（平台 key 已被 routeAfterRouter 拦到 offtopicNode），
  // 这里转成 chatting 保持宽松：烧用户自己的 key，正常聊。
  const rawMode = state.mode ?? "chatting";
  const mode = rawMode === "offtopic" ? "chatting" : rawMode;
  const modePrompt = WORKER_PROMPTS[mode] ?? WORKER_PROMPTS.chatting;

  // 拼接 Router 指令
  let fullPrompt = state.routerInstruction
    ? `${modePrompt}\n\n## 当前指令\n${state.routerInstruction}`
    : modePrompt;

  // 平台 key 用户注入边界铁律（BYOK 用户保持宽松，不注入）
  if (!state.aiConfig) {
    fullPrompt += PLATFORM_BOUNDARY_RULE;
  }

  // 扫描历史 tool_calls，收集已推送的表单（防止重复推送）
  const pushed = new Set(state.formsPushed ?? []);
  for (const msg of (state.messages ?? [])) {
    if (msg && typeof msg === "object" && "tool_calls" in msg) {
      for (const tc of (msg as AIMessage).tool_calls ?? []) {
        if (tc.name === "pushForm" && tc.args?.type) {
          pushed.add(tc.args.type as string);
        }
      }
    }
  }
  if (pushed.size > 0) {
    fullPrompt += `\n\n## 已推送过的表单（禁止重复推送）\n${[...pushed].map(f => `- ${f}`).join("\n")}`;
  }

  const tools = getToolsForMode(mode);
  const model = getWorkerModel(mode, state.aiConfig).bindTools(tools);

  // 替换旧 system message，确保 worker 总用对应当前 mode 的提示词
  const msgs = [...(state.messages ?? [])];
  if (msgs.length > 0 && msgs[0]?.getType?.() === "system") {
    msgs[0] = new SystemMessage(fullPrompt);
  } else {
    msgs.unshift(new SystemMessage(fullPrompt));
  }

  console.log(`[Worker] mode=${mode}  tools=${tools.map(t => t.name).join(",")}  prompt=${fullPrompt.length}chars`);

  // 用 stream() 触发 on_chat_model_stream 事件，实现 token 级流式输出；
  // 手动合并 chunk 得到完整消息（含 tool_calls）返回给图。
  // AbortSignal 显式超时兜底，防止上游 API 挂起导致对话永久卡死。
  const needsQuality = mode === "advising" || mode === "extracting";
  const workerTimeout = needsQuality ? 90_000 : 45_000;
  const wt0 = Date.now();
  let response: AIMessageChunk | null = null;
  const stream = await model.stream(msgs, { signal: AbortSignal.timeout(workerTimeout) });
  for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
    response = response ? response.concat(chunk) : chunk;
  }
  console.log(`[Worker] stream 耗时 ${Date.now() - wt0}ms  chars=${typeof response?.content === "string" ? response.content.length : 0}`);

  return {
    messages: [response ?? new AIMessage({ content: "" })],
    iterationCount: 1,
    formsPushed: [...pushed],
  };
}

// ── 路由逻辑 ──

function shouldContinue(state: GraphStateType): "tools" | "__end__" {
  const messages = state.messages ?? [];
  const lastMsg = messages[messages.length - 1];

  if (lastMsg && typeof lastMsg === "object" && "tool_calls" in lastMsg) {
    const tc = (lastMsg as AIMessage).tool_calls;
    if (tc && tc.length > 0) {
      return "tools";
    }
  }
  return "__end__";
}

// ── Off-topic 软拒节点（仅平台 key 用户到达，零大模型成本）──

async function offtopicNode(_state: GraphStateType): Promise<Partial<GraphStateType>> {
  const reply = OFFTOPIC_REPLIES[Math.floor(Math.random() * OFFTOPIC_REPLIES.length)];
  recordDegradation("offtopic_blocked");
  return { messages: [new AIMessage({ content: reply })] };
}

// ── Router 之后分流：平台 key 的 offtopic 拦到软拒节点，其余（含 BYOK）进 worker ──

function routeAfterRouter(state: GraphStateType): "worker" | "offtopic" {
  if (state.mode === "offtopic" && !state.aiConfig) return "offtopic";
  return "worker";
}

// ── 工具节点 ──

const toolNode = new ToolNode(AGENT_TOOLS, { handleToolErrors: true });

// ── 构建图 ──

const agentGraph = new StateGraph(GraphState)
  .addNode("router", routerNode)
  .addNode("worker", workerNode)
  .addNode("offtopic", offtopicNode)
  .addNode("tools", toolNode)
  .addEdge("__start__", "router")
  .addConditionalEdges("router", routeAfterRouter, {
    worker: "worker",
    offtopic: "offtopic",
  })
  .addConditionalEdges("worker", shouldContinue, {
    tools: "tools",
    __end__: "__end__",
  })
  .addEdge("tools", "worker")
  .addEdge("offtopic", "__end__")
  .compile();

export { agentGraph };

// ── 便捷运行函数 ──

export interface RunAgentInput {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  /** 客户端当前简历数据，供 extractResume 工具增量提取 */
  resumeData?: Record<string, unknown>;
  /** BYOK：用户自带 API 配置（主对话 worker 走用户 key） */
  aiConfig?: { baseUrl: string; apiKey: string; model: string };
}

// ── 将对话历史转换为 LangChain 消息 ──

function toLangChainMessages(
  msgs: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): BaseMessage[] {
  return msgs.map((m) => {
    switch (m.role) {
      case "system":
        return new SystemMessage(m.content);
      case "user":
        return new HumanMessage(m.content);
      case "assistant":
        return new AIMessage(m.content);
      default:
        return new HumanMessage(m.content);
    }
  });
}

// ── 运行函数 ──

export async function runAgent(input: RunAgentInput) {
  const initialState = {
    messages: toLangChainMessages(input.messages),
    resumeData: input.resumeData,
    aiConfig: input.aiConfig,
  };

  return agentGraph.stream(initialState);
}

/**
 * 流式运行 Agent，返回事件流（用于 SSE）
 */
export async function* streamAgent(input: RunAgentInput) {
  const initialState = {
    messages: toLangChainMessages(input.messages),
    resumeData: input.resumeData,
    aiConfig: input.aiConfig,
  };

  const eventStream = agentGraph.streamEvents(initialState, {
    version: "v2",
  });

  for await (const event of eventStream) {
    yield event;
  }
}
