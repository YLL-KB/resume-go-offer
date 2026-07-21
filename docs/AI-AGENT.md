# AI Agent 技术文档

> 简历顾问对话系统的 AI 技术栈全景说明。

---

## 一、架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        前端 (Next.js)                              │
│  ChatInput → SSE EventSource → ChatMessages → FormCard → Preview  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ POST /api/chat (SSE)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    LangGraph Agent (graph.ts)                      │
│                                                                    │
│   ┌─────────┐    tool_calls?    ┌───────────┐                    │
│   │  agent  │ ────────────────→ │   tools   │                    │
│   │ (LLM)   │ ←──────────────── │ (ToolNode)│                    │
│   └─────────┘   tool results    └───────────┘                    │
│        │                              │                            │
│        │ 无 tool_calls                │ 执行工具                    │
│        ▼                              ▼                            │
│     __end__                   4 个 Tool 函数                       │
│                                                                    │
│  模型: ChatOpenAI (智谱 GLM-4-Plus, OpenAI 兼容)                   │
│  工具: pushForm / extractResume / suggestOptimization /            │
│         searchKnowledge (RAG)                                      │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                  底层 AI 能力 (index.ts)                            │
│                                                                    │
│  OpenAI SDK (openai) ─── 智谱 API                                  │
│  /chat/completions    /embeddings                                  │
│                                                                    │
│  对话 · 结构化提取 · 文案润色 · 简历分析 · 模板解析 · 向量嵌入     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 二、技术栈一览

| 层级 | 技术 | 说明 |
|---|---|---|
| **Agent 框架** | LangGraph (`@langchain/langgraph`) | StateGraph 状态图，管理 agent↔tools 循环 |
| **LLM 调用** | LangChain ChatOpenAI (`@langchain/openai`) | 封装 OpenAI 兼容 API，支持 tool calling |
| **工具定义** | LangChain Tools (`@langchain/core/tools`) | `tool()` 函数 + Zod schema 定义工具 |
| **消息类型** | LangChain Messages (`@langchain/core/messages`) | AIMessage / SystemMessage / HumanMessage |
| **底层 SDK** | OpenAI SDK (`openai`) | 直接调用智谱 Chat API 和 Embedding API |
| **LLM 模型** | 智谱 GLM-4-Plus (`glm-4-plus`) | 对话模型，支持 tool calling |
| **Embedding** | 智谱 Embedding-3 (`embedding-3`) | 文本向量化，2048 维 |
| **向量存储** | 自研 VectorStore（内存） | 余弦相似度检索，无外部数据库依赖 |
| **数据校验** | Zod (`zod`) | 工具参数 Schema 定义 |
| **可观测性** | LangSmith (`langsmith`) | 可选，通过 `LANGCHAIN_TRACING_V2` 开关 |

### npm 依赖

```json
{
  "@langchain/core": "^1.2.2",
  "@langchain/langgraph": "^1.4.7",
  "@langchain/openai": "^1.5.5",
  "langsmith": "^0.7.4",
  "openai": "^6.42.0",
  "zod": "^3.x"
}
```

---

## 三、核心技术详解

### 3.1 LangGraph StateGraph — Agent 编排

```
__start__ → agent → (条件路由) → tools → agent → ... → __end__
```

**实现文件：** `src/lib/ai/graph.ts`

LangGraph 是一个**有状态图执行引擎**，用于构建 LLM Agent。核心概念：

#### State（状态）

```ts
const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,          // 消息列表（内置追加 reducer）
  formsPushed: Annotation<string[]>(),  // 已推送表单，防重复
  conversationPhase: Annotation(),      // 对话阶段：greeting/collecting/reviewing/refining
  iterationCount: Annotation(),         // 安全计数器，最多 8 轮 tool calling
});
```

`Annotation` 是 LangGraph 的状态声明方式。每个字段可以定义 `reducer`（新旧值如何合并）和 `default`。

#### Nodes（节点）

| 节点 | 类型 | 职责 |
|---|---|---|
| `agent` | 函数节点 | 调用 LLM（ChatOpenAI + bindTools），返回 AI 消息 |
| `tools` | ToolNode | LangGraph 预置的工具执行节点，自动解析 tool_calls 并执行 |

#### Edges（边）

| 边 | 类型 | 说明 |
|---|---|---|
| `__start__ → agent` | 普通边 | 对话从 agent 开始 |
| `agent → tools/__end__` | **条件边** | `shouldContinue()` 检查最后一条消息是否有 `tool_calls` |
| `tools → agent` | 普通边 | 工具执行完回到 agent，形成循环 |

#### 安全机制

循环（agent→tools→agent→...）最多执行 8 次，防止模型死循环消耗 token。达到上限后强制输出兜底回复。

#### 流式输出

```ts
// streamEvents v2：token 级别的事件流
const eventStream = agentGraph.streamEvents(initialState, { version: "v2" });
// 事件类型：on_chat_model_stream（逐 token）、on_chat_model_end（含 tool_calls）、on_tool_end（工具结果）
```

SSE 路由 (`route.ts`) 逐事件解析，转发给前端：
- `on_chat_model_stream` → `{ content: "..." }`
- `on_chat_model_end` → `{ tool_call: { name, args } }`
- `on_tool_end`（extractResume）→ `{ resumeData: {...} }`

---

### 3.2 Tool Calling — 工具系统

**实现文件：** `src/lib/ai/tools.ts`

AI 通过调用工具来驱动前端行为，取代了旧的 `[FORM:xxx]` 文本标记方式。

#### 工具定义方式

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const pushFormTool = tool(
  async ({ type }) => { /* 实现 */ },
  {
    name: "pushForm",          // 工具名（LLM 看到的）
    description: "...",         // 工具描述（LLM 据此判断何时调用）
    schema: z.object({ ... }),  // Zod schema（参数类型定义）
  },
);
```

LangChain 的 `tool()` 工厂函数将 Zod schema + 描述自动转换为 OpenAI Function Calling 格式传给模型。

#### 四个工具

| 工具 | 触发场景 | 执行逻辑 |
|---|---|---|
| **pushForm(type)** | 收集到足够信息后推送表单 | 返回确认文本，前端拦截 SSE `tool_call` 事件渲染 FormCard |
| **extractResume()** | 用户确认信息完整 | 读取对话历史 → 调 `ai.extractResumeData()` → LLM 生成结构化 JSON |
| **suggestOptimization(text)** | 用户描述平淡、口语化 | 调 `ai.improveText()` → LLM 润色改写 |
| **searchKnowledge(query)** | 用户问简历写作技巧 | 向量检索知识库 → 返回 top-3 相关建议（RAG） |

---

### 3.3 RAG — Embedding 检索增强生成

**实现文件：** `src/lib/ai/embeddings.ts` + `src/lib/ai/vectorstore.ts` + `src/lib/ai/knowledge.ts`

#### 工作流程

```
用户问"怎么写好工作经历"
  → AI 调用 searchKnowledge("怎么写好工作经历")
    → embedText() 将查询转为 2048 维向量
    → VectorStore.search() 余弦相似度检索 top-3
    → 返回相关知识片段
  → AI 将检索结果融入回复
```

#### Embedding 模型

| 属性 | 值 |
|---|---|
| 模型 | `embedding-3`（智谱） |
| 维度 | 2048（可配：256/512/1024/2048） |
| 单条上限 | 3072 tokens |
| 批量上限 | 64 条/次 |
| API | `POST {OPENAI_BASE_URL}/embeddings`（OpenAI 兼容） |

#### VectorStore

自研轻量级内存向量存储，不需要外部数据库：

```
class VectorStore {
  add(vectors, metadatas)     // 批量添加向量+元数据
  search(query, k)            // 余弦相似度检索 top-k
  size                        // 当前条目数
}
```

内部实现就是数组 + 余弦相似度排序。全局单例，启动时懒加载知识库。

#### 知识库

`src/lib/ai/knowledge.ts` — 41 条简历写作最佳实践，分 7 类：

| 类别 | 条目数 | 内容 |
|---|---|---|
| work-experience | 8 | STAR 法则、量化成果、动词选择、侧重点调整 |
| projects | 4 | 技术栈写法、项目亮点、GitHub 链接 |
| skills | 4 | 分类建议、熟练度标注、关键词策略 |
| summary | 4 | 电梯演讲结构、差异化竞争力 |
| education | 3 | 学历写法、荣誉取舍 |
| format | 5 | 一页原则、字体排版、配色、PDF 命名 |
| general | 13 | ATS 优化、定制投递、空档期、动态维护 |

#### 初始化机制

懒加载 + 防并发：首次 agent 调用时触发 `ensureKnowledgeBase()`，调用 `embedTexts()` 批量向量化全部 41 条（只需 1 次 API 请求），之后毫秒级检索。失败自动重置，下次重试。

---

### 3.4 底层 AI 能力 — OpenAI 兼容 SDK

**实现文件：** `src/lib/ai/index.ts`

Agent 的 tool 实现最终回调到这里。基于原生 `openai` SDK，所有模型调用走 OpenAI 兼容协议：

```ts
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,  // 智谱: https://open.bigmodel.cn/api/paas/v4/
});
```

#### 能力清单

| 方法 | 用途 | 底层调用 |
|---|---|---|
| `ai.chat(messages)` | 流式对话 | `POST /chat/completions` (stream) |
| `ai.extractResumeData(text)` | 对话→结构化 JSON | `POST /chat/completions` |
| `ai.improveText(text)` | 单句润色 | `POST /chat/completions` |
| `ai.generateSummary(profile)` | 生成个人总结 | `POST /chat/completions` |
| `ai.analyzeResume(content)` | 简历评分+分析 | `POST /chat/completions` |
| `ai.improveResumeSection()` | 逐段优化 | `POST /chat/completions` |
| `ai.parseResume(content)` | 简历→表单字段 | `POST /chat/completions` |
| `ai.analyzeTemplate(text)` | 模板结构识别 | `POST /chat/completions` |
| `ai.summarizeTemplate(text)` | 模板摘要 | `POST /chat/completions` |
| `embedText(text)` | 文本→向量 | `POST /embeddings` |
| `embedTexts(texts)` | 批量向量化 | `POST /embeddings` |

#### JSON 解析容错

`safeJsonParse()` — 6 层兜底解析策略：
1. 去掉 markdown 代码块
2. 直接 `JSON.parse`
3. 正则提取 JSON 对象
4. 去 trailing commas + 注释
5. 深度计数匹配花括号
6. 正则逐字段兜底

---

## 四、模式切换

`src/app/api/chat/route.ts` 通过环境变量控制两种模式：

| 环境变量 | 模式 | 说明 |
|---|---|---|
| `LANGGRAPH_ENABLED=true` | **LangGraph Agent** | StateGraph + Tool Calling + RAG |
| 未设置 / `false` | **纯 Chat** | 直接调用 `ai.chat()` + `[FORM:xxx]` 文本标记 |

```
if (USE_LANGGRAPH) {
  streamAgent({ messages: agentInput })   // LangGraph 流式事件
} else {
  ai.chat(chatMessages)                    // 纯 OpenAI stream
}
```

---

## 五、环境变量

```bash
# 必需 — AI 服务（当前使用智谱）
OPENAI_API_KEY=xxx                         # API Key
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
AI_MODEL=glm-4-plus                       # 对话模型

# Agent 模式
LANGGRAPH_ENABLED=true                     # 启用 LangGraph Agent

# Embedding（可选，有默认值）
EMBEDDING_MODEL=embedding-3               # 向量模型，默认 embedding-3

# 可选 — 可观测性
LANGCHAIN_TRACING_V2=true                  # 启用 LangSmith 追踪
LANGCHAIN_API_KEY=ls__xxx
LANGCHAIN_PROJECT=resume-go-offer
```

---

## 六、数据流

```
1. 用户输入 → POST /api/chat
2. 从 D1 读取历史消息 → 拼接成 messages[]
3. LangGraph Agent:
   a. agentNode: ChatOpenAI.bindTools(AGENT_TOOLS).invoke(messages)
   b. shouldContinue: 检查是否有 tool_calls
   c. toolNode: 执行工具（pushForm / extractResume / suggestOptimization / searchKnowledge）
   d. 回到 a. 继续，或结束
4. streamEvents 逐 token → SSE → 前端
5. 前端解析 content / tool_call / resumeData 事件 → 渲染消息、表单卡片、简历预览
```

---

## 七、文件索引

| 文件 | 职责 |
|---|---|
| `src/lib/ai/graph.ts` | LangGraph Agent 定义：状态、节点、路由、流式输出 |
| `src/lib/ai/tools.ts` | 4 个 Tool 定义（pushForm, extractResume, suggestOptimization, searchKnowledge） |
| `src/lib/ai/embeddings.ts` | `embedText()` / `embedTexts()` — 文本向量化 |
| `src/lib/ai/vectorstore.ts` | `VectorStore` — 内存向量存储 + 余弦相似度检索 |
| `src/lib/ai/knowledge.ts` | 41 条简历写作知识库 |
| `src/lib/ai/prompts.ts` | System Prompt（~130 行）+ 结构化提取 Prompt + 开场白 |
| `src/lib/ai/index.ts` | OpenAI 客户端封装 + 10 个 AI 能力函数 + JSON 容错解析 |
| `src/app/api/chat/route.ts` | SSE 对话 API：双模式（LangGraph / 纯 Chat）+ D1 持久化 |
