# 技术栈说明文档

> 本文档说明项目 `resume-go-offer`（AI 简历生成与 PDF 编辑器）使用的每一类技术、它负责什么、代码在哪个文件。按模块组织，方便快速定位。

---

## 0. 项目概览

一句话：**一个「对话式 AI 简历顾问 + 基于 PDF 原位替换的在线简历编辑器」的 Web 应用。**

核心链路：

```
用户对话 ──► LangGraph 2-Agent ──► 推表单收集信息 / 提取简历 / 给建议
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
              填表单 / 上传简历                        上传模板 PDF
                        │                                   │
                        ▼                                   ▼
              ResumeData (Zod)                    pdfjs-dist 逐块提取
                        │                                   │
                        ▼                                   ▼
              套模板渲染 (React)                 原位替换 + pdf-lib 回填
                        │                                   │
                        └──────────────► 导出 PDF ◄──────────┘
```

技术栈总览：**Next.js 16（App Router） + React 19 + TypeScript + Tailwind CSS 4 + Zustand + LangGraph + Drizzle ORM + SQLite/D1 + pdf-lib/pdfjs-dist**。

---

## 1. 基础框架

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **Next.js 16.2.6**（App Router + Turbopack） | 全栈框架：页面、API 路由、SSR/SSG、SSE 流式响应。`src/app/` 下同时放页面和 API。 | `next.config.ts`、`src/app/**` |
| **React 19** | UI 框架 | `src/components/**`、`src/app/**/page.tsx` |
| **TypeScript 5** | 类型系统。构建时 `ignoreBuildErrors: true`（类型校验在 CI/本地 `tsc --noEmit` 单独做） | `tsconfig.json`、`next.config.ts` |
| **Tailwind CSS 4** | 原子化 CSS。通过 PostCSS 插件接入，全局样式在 `globals.css` | `src/app/globals.css` |

页面（`src/app/`）：`/`（首页）、`/chat`（对话）、`/login`（登录）、`/admin`（管理后台）、`/applications`（投递记录）、`/resume/*`（简历列表/新建/预览）、`/m/chat`（移动端对话）。

移动端分流：`src/proxy.ts`（Next 16 的 middleware 改名 proxy）按 User-Agent 把 `/chat` 重定向到 `/m/chat`。

---

## 2. UI 组件

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **Radix UI**（`@radix-ui/react-*`） | 无样式、可访问的基础组件（dialog/dropdown/select/tabs/tooltip/avatar/popover/scroll-area/separator/slot/label），作为 shadcn 组件的底层 | `src/components/ui/*.tsx` |
| **shadcn/ui** | 基于 Radix + Tailwind 的组件封装 | `src/components/ui/*.tsx`（button/card/input/textarea/dialog/select 等） |
| **Base UI**（`@base-ui/react`） | 补充 Radix 之外的组件 | — |
| **lucide-react** | 图标库 | 各组件内 `import { ... } from "lucide-react"` |
| **framer-motion** | 动画/过渡 | 聊天、表单等组件 |
| **sonner** | Toast 通知 | 全局调用 `toast()` |
| **class-variance-authority / clsx / tailwind-merge** | 组件样式变体与 className 合并 | `src/components/ui/button.tsx` 等 |

---

## 3. 状态管理

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **Zustand 5** | 全局状态。两个 store：对话态 + 编辑器态 | `src/stores/chat-store.ts`、`src/stores/editor-store.ts` |
| **ahooks** | React hooks 工具集（`useRequest` 等） | — |

- `chat-store.ts`：对话 ID、消息列表、流式状态、简历数据 `resumeData`、`quoteText`（引用追问）、`regeneratePrompt`、`quickSend` 等。操作包括 `loadConversation`/`deleteMessage`/`renameConversation`/`startNewChat` 等。
- `editor-store.ts`：编辑器状态 —— 模板标识、Markdown 提取结果（`mdModules`）、图片（`templateImages`/`editedImages`/`deletedImages`）、自定义页 `customPages`、AI 分析 `aiAnalysis`、简历持久化（`resumeData`/`resumeId`/`saving`/`saved`）。`persist` 中间件只把 `aiAnalysis` 存 sessionStorage。

---

## 4. 表单与校验

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **react-hook-form** | 表单状态管理（受控/非受控、校验触发） | `src/components/chat/EditResumeForm.tsx`、`FormCard.tsx` |
| **zod 4** | schema 校验 + 类型推导。简历数据结构用 zod 定义，`z.infer` 生成 TS 类型 | `src/lib/validators/resume.schema.ts` |
| **@hookform/resolvers** | 把 zod schema 接入 react-hook-form | 同上 |

`resume.schema.ts` 定义整份简历结构：`basic`（基本信息）、`summary`（总结）、`education[]`、`experience[]`、`projects[]`、`skills[]`、`categorizedSkills`，并 `passthrough()` 放行 `editedModules` 等编辑器额外字段。`DEFAULT_RESUME_DATA` 从它导出。

---

## 5. AI 对话系统（核心）

### 5.1 LangGraph 2-Agent 架构

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **@langchain/langgraph** | 构建多节点 Agent 状态图（StateGraph + 条件边） | `src/lib/ai/graph.ts` |
| **@langchain/openai** | LangChain 的 OpenAI 兼容 ChatModel（`ChatOpenAI`） | `src/lib/ai/graph.ts` |
| **@langchain/core** | 消息类型（`AIMessage`/`SystemMessage`/`HumanMessage`）、tool 定义、ToolNode | `src/lib/ai/graph.ts`、`src/lib/ai/tools.ts` |
| **openai**（官方 SDK） | 原始 AI 调用 + Embedding + 标题生成 | `src/lib/ai/index.ts`、`src/app/api/chat/route.ts` |

图结构（`src/lib/ai/graph.ts`）：

```
__start__ → router → worker → (有 tool_calls ?) → tools → worker → __end__
```

- **Router 节点**：用快模型 `glm-4-flash`（`ROUTER_MODEL`）对最近 5 条消息做意图分类，输出 `mode`（`chatting`闲聊 / `collecting`收集信息 / `advising`给建议 / `extracting`确认生成）+ 一句 `instruction`。
- **Worker 节点**：根据 `mode` 加载对应系统提示词（`WORKER_PROMPTS`），`bindTools` 绑定工具，`model.invoke()` 生成回复。高频模式用快模型，`advising/extracting` 用质量模型（`AI_MODEL`，默认 `gpt-4o-mini`，生产配 `glm-4-plus`）。
- 防死循环：`iterationCount` 计数器，`MAX_ITERATIONS = 8` 强制结束。
- 提示词集中管理在 `src/lib/ai/prompts.ts`（`ROUTER_PROMPT` + `WORKER_PROMPTS` + `GREETING_NEW_USER`）。

### 5.2 RAG 简历写作知识库

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **Embedding** | 智谱 `embedding-3` 模型（OpenAI 兼容接口，2048 维），把知识条目转成向量 | `src/lib/ai/embeddings.ts` |
| **VectorStore**（自研） | 纯内存向量存储，余弦相似度 top-k 检索，不依赖外部向量库 | `src/lib/ai/vectorstore.ts` |
| **知识库** | 硬编码的简历写作知识条目（STAR 法则、量化成果、强力动词等，80–300 字/条），懒加载时批量 embedding 进 VectorStore | `src/lib/ai/knowledge.ts` |

### 5.3 工具调用（Agent Tools）

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **LangChain tool** | 用 `tool()` 定义 AI 可调用的工具，取代早期脆弱的 `[FORM:xxx]` 文本标记 | `src/lib/ai/tools.ts` |

工具列表（`AGENT_TOOLS`）：
- `pushForm`：推一个表单卡片给前端（类型 basic/education/experience/project/skills/summary）。
- `extractResume`：从消息中提取简历结构化数据，SSE 推 `resumeData` 给前端。
- `retrieveKnowledge`：按模式检索 RAG 知识库。

### 5.4 流式输出（SSE）

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **ReadableStream + SSE** | `POST /api/chat` 返回 `text/event-stream`，逐 token 推给前端 | `src/app/api/chat/route.ts` |
| **`streamEvents` v2** | LangGraph 事件流，监听 `on_chat_model_stream`（逐 token）/ `on_chat_model_end`（本轮是否调工具）/ `on_tool_end`（工具结果） | `src/lib/ai/graph.ts`（`streamAgent`）、`src/app/api/chat/route.ts` |
| **前端 SSE 解析** | `src/lib/utils/sse.ts` 解析 `data:` 事件；`ChatInput.tsx`/`ChatMessages.tsx` 消费 | `src/lib/utils/sse.ts`、`src/components/chat/*` |

去重机制：用 `run_id` 区分工具调用轮次与最终答复轮次 —— 工具调用轮的开场白不落库、前端收到 `tool_call` 后清空气泡；最终答复轮实时推送并落库。模型切换：`LANGGRAPH_ENABLED === "true"` 走 Agent，否则走原始 `ai.chat()`（`src/app/api/chat/route.ts` 顶部）。

### 5.5 其他 AI 能力

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **附件解析** | 上传简历（PDF/Word/图片）→ 提取文本 | `src/lib/ai/attachment-parser.ts` |
| **MinerU**（`mineru-open-sdk`） | 服务端 PDF → Markdown 语义提取，降级链：MinerU 高精度 → MinerU Flash → pdfjs-dist 本地 | `src/lib/pdf/mineru-extractor.ts`、`src/app/api/templates/[id]/extract-markdown/route.ts` |
| **AI 分析/润色/摘要/改进** | 独立 API | `src/app/api/ai/{analyze-resume,improve,improve-resume,generate-summary,parse-resume}.ts`、`src/app/api/analysis/[id]/route.ts` |

---

## 6. 数据库

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **Drizzle ORM**（`drizzle-orm`） | 类型安全 ORM，schema 定义 + 查询 | `src/lib/db/schema.ts`、`src/lib/db/index.ts` |
| **better-sqlite3** | 本地/VPS 实际使用的 SQLite 引擎（同步 API，WAL 模式） | `src/lib/db/index.ts` |
| **@cloudflare/d1** | Cloudflare D1 绑定支持（`getCloudflareContext()` 可用时优先 D1） | `src/lib/db/index.ts` |

`getDb()` 逻辑（`src/lib/db/index.ts`）：先尝试 `getCloudflareContext().env.DB`（D1），不可用则回退 `better-sqlite3` 打开 `.db/local.db`，并自动执行 `MIGRATIONS` 数组建表。当前部署在 VPS（非 Cloudflare），所以实际走 SQLite。

数据表（`src/lib/db/schema.ts`）：
- `users` — 用户（authing_sub / github_id / name / email / avatar）
- `conversations` — 对话（userId / resumeId / title）
- `messages` — 消息（conversationId / role / content）
- `resumes` — 简历（userId / templateId / data JSON / version）
- `applications` — 投递记录（company / position / status 枚举）
- `request_logs` — API 请求日志

---

## 7. 认证

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **Authing OIDC** | 托管登录页（微信/支付宝/手机验证码），不引入 SDK，手动实现 OIDC 流程 | `src/lib/auth/oidc.ts`、`src/lib/auth/index.ts`、`src/app/api/auth/{login,callback,logout,me}/route.ts` |
| **GitHub OAuth** | GitHub 第三方登录 | `src/lib/auth/github.ts`、`src/app/api/auth/github/{authorize,callback}/route.ts` |
| **微信登录** | 微信扫码/授权登录 | `src/lib/auth/wechat.ts`、`src/app/api/auth/wechat/{login,callback}/route.ts` |
| **匿名用户** | 未登录用 `anon_id` cookie 持久化身份（换 IP 不丢对话） | `src/lib/auth/utils.ts`（`getAuthUserId`/`setAnonymousCookie`） |
| **管理后台鉴权** | 管理员校验 | `src/lib/auth/admin.ts` |

核心函数：`getAuthUserId(request)`（`src/lib/auth/utils.ts`）统一解析「已登录用户 ID」或「匿名 ID」，所有 API 路由都通过它拿身份。本地开发（`NODE_ENV === "development"`）无 cookie 时返回 mock 用户免登录。

---

## 8. PDF 处理

这是编辑器的技术核心，完整设计见 `EDITOR-DESIGN.md`。

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **pdfjs-dist 5** | 客户端解析 PDF，逐字符提取文本坐标/字号/字体/颜色 → `RichTextBlock[]` | `src/lib/pdf/text-extractor.ts` |
| **pdf-lib + @pdf-lib/fontkit** | 服务端回填：同位置覆盖文字、涂白、嵌入 NotoSansSC CJK 字体、复制页、生成自定义页 | `src/app/api/templates/[id]/fill/route.ts` |
| **react-pdf** | React 里渲染 PDF 预览 | `src/components/preview/*`、`ClickablePdfView.tsx` |
| **@napi-rs/canvas** | 服务端渲染图片/文字到画布（`serverExternalPackages` 里声明） | `next.config.ts`、fill 相关路由 |
| **docx** | 生成 Word 简历 | `src/app/api/**` |
| **mammoth** | 解析 `.docx` → HTML（附件解析用） | `src/lib/ai/attachment-parser.ts` |
| **jspdf / html2canvas / html-to-image** | 前端 HTML → 图片/PDF 导出（预览截图） | 预览组件 |

PDF 子模块（`src/lib/pdf/`）：
- `text-extractor.ts` — pdfjs 提取文字块（含 fontSize/fontName/color）
- `image-extractor.ts` — 提取 PDF 里的图片（OperatorList 遍历）
- `mineru-extractor.ts` — MinerU API 提取 Markdown
- `module-detector.ts` — 识别文字块归属模块
- `page-renderer.ts` — 页面渲染辅助
- `src/lib/editor/html-parser.ts` — 文字块 ↔ HTML 互转（`buildModuleHtml` / `parseHtmlToLines` / `rgbToHex` / `mapPdfFontToCss`）

---

## 9. 简历渲染与模板

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **模板注册表** | 模板配置 + 组件注册，加新模板只改 registry | `src/components/templates/registry.ts` |
| **Classic 模板** | 目前唯一模板（React 组件渲染 ResumeData） | `src/components/templates/classic/{index,config}.tsx` |
| **TemplateResume** | 模板统一渲染入口 + 主题（`ResumeTheme`，如 `ocean`） | `src/components/resume/TemplateResume.tsx` |
| **预览组件** | PDF 预览、点击定位、分页 | `src/components/preview/*`（`ClickablePdfView`、`PdfPageView`、`page-break-line`、`use-auto-one-page`、`use-content-height`） |
| **技能 HTML 渲染** | 技能分类渲染 | `src/lib/skills-html.ts`、`src/app/api/resume/render-skills/route.ts` |
| **数据合并** | 多来源 ResumeData 合并 | `src/lib/utils/merge-data.ts` |

编辑器状态与数据模型见 `EDITOR-DESIGN.md`（两层编辑模型：模版页逐块原位编辑 + 自定义页自由排版）。

---

## 10. 部署与监控

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **PM2** | VPS 进程管理（进程名 `resume`，`pm2 restart resume`） | `deploy.sh` |
| **deploy.sh** | 一键部署：git push → 服务器 pull → `pnpm install` → `next build` → `pm2 restart`；GitHub 不可达时回退 SCP 打包 | `deploy.sh`（即 `pnpm deploy:vps`） |
| **Sentry**（`@sentry/nextjs`） | 错误监控 | `next.config.ts` 相关初始化、`src/app/**` |
| **request-logger** | 自研请求日志：`withRequestLog` 包装每个 API route，异步记录 method/path/用户/IP/状态码/耗时/错误到 `request_logs` 表 | `src/lib/logging/request-logger.ts` |
| **rate-limit** | 自研内存速率限制（匿名 10/分，登录 30/分） | `src/lib/rate-limit.ts` |
| **wrangler / @opennextjs/cloudflare** | Cloudflare 相关（D1 绑定、类型生成；当前生产不走 CF，保留配置） | `wrangler.jsonc`、`open-next.config.ts`、`cloudflare-env.d.ts` |
| **D1/CF 部署脚本** | `pnpm deploy`/`upload`/`preview`（Cloudflare 备用路线） | `package.json` |

部署目标见 `DEPLOY.md`：VPS `root@47.116.46.77`，目录 `/opt/resume-go-offer`，域名 `https://www.resumeoffer.cn`。

---

## 11. 其他工具

| 技术 | 作用 | 关键文件 |
|---|---|---|
| **uuid**（`crypto.randomUUID` 封装） | 生成 ID | `src/lib/utils/uuid.ts` |
| **@fontsource/noto-sans-sc** | 前端内置思源黑体字体 | `src/app/**` |
| **marked** | Markdown → HTML（AI 回复渲染） | 聊天组件 |
| **drizzle-kit** | Drizzle 迁移工具（dev 依赖） | `package.json` |
| **ESLint 9 + eslint-config-next** | 代码规范 | `.eslintrc*`、`eslint.config.*` |

---

## 附：关键目录速查

```
src/
├── app/                    # Next.js 页面 + API 路由（App Router）
│   ├── api/                #   全部后端接口（chat/ai/auth/pdf/resume/templates/...）
│   ├── chat/ m/chat/       #   对话页（PC + 移动端）
│   ├── resume/ admin/ applications/ login/
│   └── proxy.ts            #   (原 middleware) 移动端 UA 分流
├── components/
│   ├── chat/               # 对话 UI（输入、消息、表单卡片、简历预览面板）
│   ├── preview/            # PDF 预览 + 点击定位
│   ├── resume/             # 模板统一渲染 TemplateResume
│   ├── templates/          # 模板注册表 + classic 模板
│   └── ui/                 # shadcn/Radix 基础组件
├── stores/                 # Zustand（chat-store / editor-store）
├── hooks/                  # use-auth / use-device
└── lib/
    ├── ai/                 # LangGraph Agent、工具、提示词、RAG、Embedding、附件解析
    ├── db/                 # Drizzle schema + getDb（D1/SQLite）
    ├── auth/               # OIDC / GitHub / 微信 / 匿名鉴权
    ├── pdf/                # pdfjs 提取、MinerU、图片提取、模块识别、页面渲染
    ├── editor/             # html-parser（文字块 ↔ HTML）
    ├── logging/            # 请求日志
    ├── validators/         # zod 简历 schema
    └── utils/              # sse / uuid / merge-data 等
```
