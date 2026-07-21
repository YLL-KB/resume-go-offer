/**
 * LangGraph Agent — 简历顾问对话图
 *
 * 用状态图管理对话流程：agent 节点做决策，tools 节点执行工具调用。
 * 取代之前纯 prompt 驱动的 [FORM:xxx] 文本标记方式。
 */

import { StateGraph, Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { AGENT_TOOLS } from "./tools";
import { SYSTEM_PROMPT } from "./prompts";
import { RESUME_KNOWLEDGE_BASE } from "./knowledge";
import { vectorStore } from "./vectorstore";
import { embedTexts } from "./embeddings";

// ── 知识库初始化（懒加载，只执行一次）──

let knowledgeInitPromise: Promise<void> | null = null;

async function ensureKnowledgeBase(): Promise<void> {
  if (vectorStore.size > 0) return; // 已初始化
  if (knowledgeInitPromise) return knowledgeInitPromise; // 初始化进行中

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
      // 重置 promise 以便下次重试
      knowledgeInitPromise = null;
      throw err;
    }
  })();

  return knowledgeInitPromise;
}

// ── 状态定义 ──

const GraphState = Annotation.Root({
  // 继承内置消息 reducer（支持追加/更新）
  ...MessagesAnnotation.spec,

  // 已推送的表单（防重复）
  formsPushed: Annotation<string[]>({
    reducer: (current, update) => [...new Set([...(current ?? []), ...(update ?? [])])],
    default: () => [],
  }),

  // 当前对话阶段
  conversationPhase: Annotation<"greeting" | "collecting" | "reviewing" | "refining">({
    reducer: (_, update) => update,
    default: () => "greeting",
  }),

  // 安全计数器：防止 tool calling 死循环
  iterationCount: Annotation<number>({
    reducer: (current, update) => (current ?? 0) + (update ?? 0),
    default: () => 0,
  }),
});

type GraphStateType = typeof GraphState.State;

// ── 常量 ──

const MAX_ITERATIONS = 8; // 最多 8 轮 tool calling

// ── 获取模型 ──

function getModel() {
  return new ChatOpenAI({
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 4096,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
  });
}

// ── Agent 节点 ──

async function agentNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  // 懒初始化知识库（首次调用时触发，不阻塞 agent 响应）
  ensureKnowledgeBase().catch(() => {});

  // 安全检查：防止无限 tool calling 循环
  if ((state.iterationCount ?? 0) >= MAX_ITERATIONS) {
    return {
      messages: [
        new AIMessage({
          content:
            "好的，我这边已经处理了不少信息。咱们先看看目前的成果，有什么需要调整的你随时告诉我。",
        }),
      ],
      iterationCount: 0, // 重置
    };
  }

  const model = getModel().bindTools(AGENT_TOOLS);

  // 确保 system prompt 是第一条消息
  const msgs = state.messages ?? [];
  const hasSystemMsg = msgs.length > 0 && msgs[0]?.getType?.() === "system";
  const messages = hasSystemMsg
    ? msgs
    : [new SystemMessage(SYSTEM_PROMPT), ...msgs];

  const response = await model.invoke(messages);

  return {
    messages: [response],
    iterationCount: 1,
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
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    __end__: "__end__",
  })
  .addEdge("tools", "agent")
  .compile();

export { agentGraph };

// ── 便捷运行函数 ──

export interface RunAgentInput {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  conversationPhase?: "greeting" | "collecting" | "reviewing" | "refining";
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
    conversationPhase: input.conversationPhase ?? "collecting",
  };

  return agentGraph.stream(initialState);
}

/**
 * 流式运行 Agent，返回事件流（用于 SSE）
 */
export async function* streamAgent(input: RunAgentInput) {
  const initialState = {
    messages: toLangChainMessages(input.messages),
    conversationPhase: input.conversationPhase ?? "collecting",
  };

  // 使用 streamEvents 获取 token 级别的事件
  const eventStream = agentGraph.streamEvents(initialState, {
    version: "v2",
  });

  for await (const event of eventStream) {
    yield event;
  }
}
