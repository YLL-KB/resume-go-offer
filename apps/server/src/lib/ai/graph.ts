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
import { ROUTER_PROMPT, WORKER_PROMPTS } from "./prompts";
import { RESUME_KNOWLEDGE_BASE } from "./knowledge";
import { vectorStore } from "./vectorstore";
import { embedTexts } from "./embeddings";

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

  // Router 分类结果
  mode: Annotation<"chatting" | "collecting" | "advising" | "extracting">({
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

// ── 获取模型 ──

function getRouterModel() {
  return new ChatOpenAI({
    model: process.env.ROUTER_MODEL ?? "glm-4-flash",
    temperature: 0.1,
    maxTokens: 48,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
  });
}

function getWorkerModel(mode?: string) {
  // chatting/collecting 是高频模式，用快模型；advising/extracting 用质量模型
  const needsQuality = mode === "advising" || mode === "extracting";
  const model = needsQuality
    ? (process.env.AI_MODEL ?? "gpt-4o-mini")
    : (process.env.ROUTER_MODEL ?? "glm-4-flash");

  return new ChatOpenAI({
    model,
    temperature: 0.7,
    maxTokens: needsQuality ? 4096 : 2048,
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

  // 只取最近 5 条消息给 Router
  const msgs = state.messages ?? [];
  const recentMsgs = msgs.slice(-5);

  const response = await model.invoke([
    new SystemMessage(ROUTER_PROMPT),
    ...recentMsgs,
  ]);
  console.log(`[Router] invoke 耗时 ${Date.now() - t0}ms`);

  const content = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  console.log(`[Router] 原始输出: ${content.slice(0, 200)}`);

  const validModes = ["chatting", "collecting", "advising", "extracting"];

  try {
    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    const mode = validModes.includes(parsed.mode) ? parsed.mode : "collecting";
    const instruction = typeof parsed.instruction === "string" ? parsed.instruction : "";
    console.log(`[Router] → ${mode} | ${instruction}`);
    return { mode, routerInstruction: instruction };
  } catch {
    console.warn("[Router] JSON 解析失败，fallback → collecting");
    return { mode: "collecting", routerInstruction: "" };
  }
}

// ── Worker 节点 ──

async function workerNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  ensureKnowledgeBase().catch(() => {});

  // 安全检查
  if ((state.iterationCount ?? 0) >= MAX_ITERATIONS) {
    return {
      messages: [
        new AIMessage({
          content: "好的，我这边已经处理了不少信息。咱们先看看目前的成果，有什么需要调整的你随时告诉我。",
        }),
      ],
      iterationCount: 0,
    };
  }

  const mode = state.mode ?? "chatting";
  const modePrompt = WORKER_PROMPTS[mode] ?? WORKER_PROMPTS.chatting;

  // 拼接 Router 指令
  let fullPrompt = state.routerInstruction
    ? `${modePrompt}\n\n## 当前指令\n${state.routerInstruction}`
    : modePrompt;

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
  const model = getWorkerModel(mode).bindTools(tools);

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
  const wt0 = Date.now();
  let response: AIMessageChunk | null = null;
  const stream = await model.stream(msgs);
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

// ── 工具节点 ──

const toolNode = new ToolNode(AGENT_TOOLS, { handleToolErrors: true });

// ── 构建图 ──

const agentGraph = new StateGraph(GraphState)
  .addNode("router", routerNode)
  .addNode("worker", workerNode)
  .addNode("tools", toolNode)
  .addEdge("__start__", "router")
  .addEdge("router", "worker")
  .addConditionalEdges("worker", shouldContinue, {
    tools: "tools",
    __end__: "__end__",
  })
  .addEdge("tools", "worker")
  .compile();

export { agentGraph };

// ── 便捷运行函数 ──

export interface RunAgentInput {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
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
  };

  return agentGraph.stream(initialState);
}

/**
 * 流式运行 Agent，返回事件流（用于 SSE）
 */
export async function* streamAgent(input: RunAgentInput) {
  const initialState = {
    messages: toLangChainMessages(input.messages),
  };

  const eventStream = agentGraph.streamEvents(initialState, {
    version: "v2",
  });

  for await (const event of eventStream) {
    yield event;
  }
}
