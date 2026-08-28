# AGENTS.md — Resume Go Offer

## 项目信息

- **项目根：** `/Users/loong/code/resume-go-offer`
- **结构：** pnpm Monorepo（`apps/*` + `packages/*`），Turborepo 编排
- **后端：** `apps/server` — Hono 4 + `@hono/node-server`（TypeScript + tsx），端口 8787
- **前端：** `apps/web` — Next.js 16 App Router + React 19，端口 3000
- **后台：** `apps/admin` — Next.js 16，端口 3001
- **共享：** `packages/shared`（zod schema + 工具）、`packages/ui`（shadcn/ui）、`packages/config`（tsconfig）
- **数据库：** SQLite (better-sqlite3) + Drizzle ORM（`getDb()` 自动建表/迁移，无 D1）
- **AI Agent：** LangGraph + LangChain（OpenAI 兼容 SDK）
- **包管理：** `pnpm`
- **开发命令：** `pnpm dev`（并行启动 web:3000 + server:8787 + admin:3001）
- **构建命令：** `pnpm build` / `pnpm typecheck` / `pnpm lint`（均为 `turbo` 分发）

## 启动流程

每次在这个项目工作时，先确认：

```bash
cd /Users/loong/code/resume-go-offer
pnpm dev   # 非 wrangler dev。wrangler dev 会连 Cloudflare 远程代理，本机无需
```

`pnpm dev` 通过 Turborepo 并行启动三个应用。前端 `/api/*` 请求经 `apps/web/next.config.ts` 的 `rewrites()` 代理到 `http://localhost:8787`（`API_ORIGIN` 环境变量可改）。

## 部署与分支规则

- **分支规则（硬性）**：任何要部署上线的内容，都必须**先进入 `main` 分支**才能部署。其他分支仅用于开发或保存代码，**不允许直接部署上线**。
- 部署前先 `git checkout main` 并确认要上线的内容已合并/提交到 `main`，再跑 `./deploy.sh`。
- 部署细节见 [DEPLOY.md](./DEPLOY.md)（生产在 VPS `root@47.116.46.77`，脚本含 GitHub 不可达时的 SCP 回退）。

## 代码规范

### 1. 返回按钮

所有页面顶部「返回」按钮必须用 `router.back()`，禁止硬编码 `<Link href="...">`。

```tsx
// ✓ 正确
import { useRouter } from "next/navigation";
const router = useRouter();
<button type="button" onClick={() => router.back()}>返回</button>

// ✗ 错误
<Link href="/">返回</Link>
<Link href="/dashboard">返回</Link>
```

**例外：** 页面 Logo / 品牌名链接保留 `<Link href="/">`，这不是返回按钮。

### 2. UI 组件

页面内所有交互 UI 优先使用 `@resume/ui`（`packages/ui`）中的 shadcn/ui 组件。

**可用组件（`packages/ui/src/components/`）：**
`app-header` `avatar` `badge` `button` `card` `dialog` `dropdown-menu` `form` `input` `label` `popover` `scroll-area` `select` `separator` `sheet` `skeleton` `tabs` `textarea` `tooltip`

| 标签 | 规则 |
|------|------|
| `div` `p` `span` `h1`~`h6` | 布局容器 / 纯文本排版 |
| `nav` `header` `main` `footer` `section` `article` | ✅ 可用，语义标签提升可访问性 |
| `button` `input` `select` `textarea` | ❌ 禁止，用 UI 组件替代 |
| `iframe` | 仅 PDF 预览可用，外层必须用 `Dialog` 包裹 |
| `<html>` `<head>` `<body>` | 文档根结构，layout.tsx 必须保留 |

```tsx
// ✓ 正确
import { Button } from "@resume/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@resume/ui";

// ✗ 错误
<button>提交</button>
<div className="modal">...</div>
<span className="tag">推荐</span>
```

### 3. 组件规模与新增规则

- **每个组件文件不超过 600 行。** 超过则拆分：抽 hooks → `hooks/`、拆子组件 → 同目录、提工具函数 → `lib/`。
- **新增组件必须使用 shadcn/ui + Tailwind CSS。** 禁止原生 `<button>` `<input>` `<select>` `<textarea>` 交互标签，语义标签 `<nav>` `<header>` `<footer>` `<section>` `<article>` 允许使用。禁止 inline `style={{}}`（动态计算除外），禁止自定义 CSS（`@media print` 等用 Tailwind `print:` 变体，`@page` 等用 `@layer base`）。
- **所有代码必须通过 ESLint 检查。** 提交前确保 `pnpm lint` 零错误零警告。禁止提交带有 `@typescript-eslint/no-unused-vars`、`react-hooks/exhaustive-deps` 等警告的代码。
- **以上规则适用于 `apps/web/src/`、`apps/admin/src/`、`packages/ui/src/` 下所有组件文件，无例外。**

### 4. API 路由

所有后端 API 都在 **`apps/server`**（Hono），`apps/web` 不写 API 实现，前端通过 rewrites 代理访问。

```ts
// apps/server/src/app.ts —— 新路由在这里挂载
api.route("/chat", chatRoutes);
api.route("/ai", aiRoutes);
```

**注意事项：**
- Hono 路由文件放在 `apps/server/src/routes/`，每个资源一个文件
- `fs.readFile` 在 server 端可用（Node 环境）；但提供文件的 API 优先用 `public/` 目录作为静态文件服务
- 需要返回 PDF → API 路由做 302 重定向到 `/uploads/xxx.pdf`，不在路由内读文件响应
- 服务器文件路径基于 `process.cwd()`（即 `apps/server/`），静态资源在 `apps/server/public/`

### 5. AI 对话（核心）

**路由架构：**
```
apps/web/src/app/chat/
├── layout.tsx            # 侧边栏 + 对话列表（全局持久）
├── page.tsx              # 新对话页（conversationId=null）
├── [id]/page.tsx         # 已有对话页（路由隔离，切换即卸载）
├── loading.tsx           # 路由切换 loading 态
```

**架构：**
```
ChatInput（用户输入）
  → /api/chat（rewrites → apps/server，SSE Streaming）
    → LangGraph Agent（工具调用循环）
      → pushForm / extractResume / retrieveKnowledge
    → 前端实时渲染 Markdown + 表单卡片
  → ChatMessages（消息列表 + ChatBubble 气泡）
  → ResumePreviewPanel（简历预览面板，分栏拖拽）
```

**关键文件：**
- `apps/server/src/lib/ai/index.ts` — AI Agent 入口（createAgent 工厂函数）
- `apps/server/src/lib/ai/graph.ts` — LangGraph StateGraph 定义 + 节点编排（router → worker ↔ tools）
- `apps/server/src/lib/ai/prompts.ts` — 系统提示词 + 提取提示词 + 开场白
- `apps/server/src/lib/ai/tools.ts` — 工具注册（pushForm / extractResume / retrieveKnowledge）
- `apps/server/src/lib/ai/knowledge.ts` — RAG 知识库检索
- `apps/server/src/lib/ai/vectorstore.ts` — 自研向量存储（Embedding + 相似度搜索）
- `apps/server/src/lib/ai/embeddings.ts` — Embedding 生成
- `apps/server/src/lib/ai/attachment-parser.ts` — 附件解析（PDF/图片 → 文字提取）
- `apps/server/src/routes/chat.ts` — POST /api/chat（SSE 转发）+ 历史/消息/开场白/提取/附件解析
- `apps/web/src/stores/chat-store.ts` — 对话状态管理（Zustand）：消息流、流式输出、引用、表单、简历数据
- `apps/web/src/components/chat/ChatContent.tsx` — 聊天主体组件（接受 conversationId prop，路由隔离核心）
- `apps/web/src/components/chat/ChatMessages.tsx` — 消息列表 + 单条气泡（Markdown 渲染、表单卡片、引用弹窗）
- `apps/web/src/components/chat/ChatInput.tsx` — 输入框（SSE 流接收、引用拼接、表单事件监听、多附件上传）
- `apps/web/src/components/chat/AttachmentBar.tsx` — 附件栏（多附件 chips 只展示「附了什么」、多选上传、链接粘贴入口）
- `apps/web/src/components/chat/use-attachments.ts` — 多附件状态管理（**发送时才解析**模型：附件仅保留本地 File/URL 引用，点发送时随 multipart 提交 /api/chat，服务端在流式开始前并行解析并拼装消息）
- `apps/web/src/components/chat/FormCard.tsx` — 6 种结构化表单（basic / education / experience / project / skills / summary）
- `apps/web/src/components/chat/ResumePreviewPanel.tsx` — 简历预览面板（模板切换、打印导出、背景色注入）

**工具调用流程：**
```
AI 输出 tool_call: { name: "pushForm", args: { type: "experience" } }
  → SSE 事件 → 前端 dispatchEvent("tool-push-form")
  → ChatMessages 渲染 FormCard 组件
  → 用户填写 → dispatchEvent("form-data")
  → ChatInput 监听 → sendRaw() 将数据发给 AI 继续对话
```

**提示词设计：**
- 系统提示词约 190 行，覆盖：核心信念、文案优化铁律（禁用词/强动词库）、STAR 追问法则、个人标签提炼、对话节奏
- 提取提示词约 100 行，以 JSON 格式输出完整简历数据，含 company 去括号规范化、project 数量校验、语言铁律
- 开场白：两套（新用户 / 已有简历用户）

**简历提取引擎（三组并行 + 增量省略 + 失败回退）：**
- 提取拆成 `core`（basic/education/skills/summary/highlights/categorizedSkills）、`experience`、`projects` 三组**并行**调用（`ai/index.ts` 的 `extractResumeParallel` / `extractSectionOnce`），wall-time ≈ 最重一组，实测全量提取从分钟级降到 ~4s
- **增量模式**：已有"完整"简历数据（`isRichResumeData`：summary 非空或 experience/projects 有 description/highlights）时，各组改用**差异检测提示词** `buildIncrementalExtractPrompt`（`prompts.ts`），只输出新增/修改的字段，全部无变化输出 `{}`（实测 ~1.2s）。⚠️ 不要把这个省略指令拼进全量提示词——130 行"必须完整输出"的铁律会压过它，模型会无视省略
- 稀疏数据（仅表单）仍走全量分块提示词 `buildSectionExtractPrompt`（复用全量铁律，只换输出 schema）
- 合并语义：省略字段由客户端 `setResumeData` 浅合并 + `mergeArrayItems` 保留；任一分组最终失败 → 回退单次全量提取 `extractFullSingle`（正确性优先）
- resumeData 随 `/api/chat` 请求体上送 → GraphState.resumeData → `extractResumeTool` 增量提取；`/api/chat/extract` 直接透传

**聊天 ↔ 「我的简历」联动：**
- 前端每次提取合并完成后调用 `syncResumeToLibrary()`（`components/chat/sync-resume.ts`）→ `POST /api/chat/resume`：对话已关联简历（`conversations.resumeId`）则**更新数据并版本 +1**，否则**新建**（标题取「姓名+的简历」或对话标题）并回填 resumeId；无实质内容的空数据不同步
- 四个同步接入点：ChatInput 的 SSE resumeData 事件（工具路径）+ handleExtract（提取按钮）、ChatMessages 的 form-done 与 [FORM:done] 自动提取
- 反向引用：「我的简历」卡片「对话」按钮 → `/chat?resumeId=xxx`：ChatContent 预载简历（setResumeData + 预览面板）+ `triggerQuickSend` 把简历文本（`lib/utils/resume-text.ts` 的 `resumeDataToText`，前缀 `[用户上传了简历文件]` 复用 router/提取规则）发给 AI 求优化
- 注意：服务端 `resume.schema.ts` 的 `education.gpa` 允许 null（提取结果缺省输出 null）

**Token 用量记账（只记账不拦截，收费窗口预留）：**
- `apps/server/src/lib/billing/pricing.ts` — 模型价格快照（元/1M tokens，可 `PRICE_JSON` 环境变量覆盖）；`ledger.ts` — `recordUsage()` 统一埋点 + `getGlobalUsage`/`getUsageSummary` 聚合 + `assertUsageAllowed()` 未来额度检查钩子（当前恒放行）
- 账本表 `token_usage`：userId / model / provider(platform|byok) / source / input&output tokens / cost_cents / 单价快照。userId 优先级：显式参数 → `runWithUsage` ALS 上下文 → trace collector → 不记
- 埋点覆盖：聊天图 router/worker（SSE 事件 usage_metadata）、ai.chat 回退与标题（`stream_options.include_usage` 最后一个 chunk 取 usage）、提取三组（tracedCompletion + core 流）、embedding、附件解析、ai.ts / templates.ts 全部 AI 路由（`aiRoutes.use("*")` 中间件注入用户上下文）
- admin 报表：`GET /api/admin/usage`（admin.logs 权限）+ 后台首页 UsageCard；`GET /api/admin/users` 每用户带 `usage30d`（tokens/costCents/calls，一次分组查询避免 N+1）；BYOK 流量 cost 记 0
- 用户端自服务：`GET /api/user/usage?days=30`（`routes/usage.ts`，`getUserUsageDetail` 返回 platform/byok 分开 + bySource 细分）→ 聊天页头部仪表盘按钮 `UsageDialog`（不进管理页即可看自己用量）

**用户自带 API（BYOK，1..N 条自定义 API）：**
- 模块：`apps/server/src/lib/billing/byok.ts`（AES-256-GCM 加密、掩码、客户端工厂、连接测试）+ `routes/byok.ts`（`/api/user/ai-config` GET/PUT/DELETE + `/test`，按 API id 操作）；表 `user_ai_apis`（每用户 1..N 条，scopes 为 JSON 多选，api_key_enc 密文，密钥只进不出，上限 10 条）
- 环节（scopes）：`chat`（主对话/标题/润色分析解析/模板分析，对应平台 AI_MODEL+openai 客户端）、`extract`（提取引擎/附件文字解析，对应 AI_EXTRACT_*）、`vision`（岗位截图识别，对应 glm-4v）；**同一环节多条 API 时最早创建的生效**，未配置的环节回落平台 key；**router 分类与 embedding 恒走平台 key**（免费/低价基础设施，避免 json_object 兼容性与 embedding 能力差异问题）
- 主密钥 `BYOK_MASTER_KEY`（64 位 hex，生产必填；开发缺省用进程内临时密钥，重启后已存配置失效）
- 路由注入：`ai/index.ts` 的 `runWithAIConfig(RuntimeAiConfigs)` ALS 上下文 + `currentChatClient()/currentChatModel()/currentExtractClient()/currentExtractModel()/currentVisionConfig()`；聊天 worker 另走 `GraphState.aiConfig`（chat scope）。`getUserAiConfigs(userId)` 负责按环节解析生效配置，调用方无需关心列表结构
- 前端：聊天页头部齿轮按钮 → `ModelSettingsDialog`（**动态列表 + 「添加 API」**，每条卡片：名称/预设/baseUrl/模型/Key/用途多选/测试/删除，子组件 `ApiConfigCard`）；用量弹窗 `UsageDialog` 展示 byModel/bySource
- 账本：BYOK 流量 `provider=byok`、`cost_cents=0`（用户已向自己的供应商付费）

**越界防护（off-topic 边界，防薅羊毛）：**
- 目标：防止用平台 key 的用户把对话当成免费通用 ChatGPT 白嫖。判定标准是**「这次 chat 烧谁的钱」**：`GraphState.aiConfig`（chat scope）存在 = 用户自带 key = 宽松；不存在（含只配了 extract/vision 但没配 chat 的 BYOK）= 烧平台钱 = 严格
- Router 新增第 5 类 `offtopic`（`prompts.ts` 的 `ROUTER_PROMPT`）：用户问与求职/简历/职业发展**完全无关**的问题（写代码/翻译/写诗/解数学题/天气/八卦/医疗法律建议/扮演角色等）分类为 offtopic；**求职相关照常分类**（职业规划/面试技巧/行业行情/薪资谈判等绝不判 offtopic）
- 分流（`graph.ts` 的 `routeAfterRouter`）：`mode===offtopic && !aiConfig` → 拦到 `offtopicNode`，返回固定软拒模板（`OFFTOPIC_REPLIES` 随机取一条），**不进 worker 大模型、零模型成本**；BYOK 用户 off-topic 仍进 worker（`workerNode` 里把 offtopic 转成 chatting）正常聊
- 第二道兜底：平台 key 用户 worker 提示词末尾注入 `PLATFORM_BOUNDARY_RULE`（`workerNode` 里 `if (!state.aiConfig) fullPrompt += ...`），防 router 漏判时平台大模型被白嫖；BYOK 用户不注入
- ⚠️ **SSE 转发坑**：`offtopicNode` 不走 `model.stream`，不触发 `on_chat_model_*` 事件，它的回复必须靠 `chat.ts` 的 `on_chain_end` 里 `event.name === "offtopic"` 分支兜底提取 `output.messages[0].content` 并 `send()`，否则用户会看到 AI 没回话

**Streaming 格式：**
```
data: {"content":"xxx","conversationId":"uuid","title":"对话标题"}
data: {"tool_call":{"name":"pushForm","args":{"type":"basic"}}}
data: {"resumeData":{...}}
data: [DONE]
```

**SSE 流式输出（重要坑）：** `apps/web/next.config.ts` 必须保持 `compress: false`。Next 的 compression 中间件会用 gzip 压缩 `text/event-stream`，导致整个流被缓冲、浏览器要等响应结束才一次性收到数据（表现为「接口在流式、页面却一次性渲染」）。禁用后前端才能逐 token 实时渲染。

**路由隔离设计：**
- `/chat` → 新对话，ChatContent 挂载，local state 干净
- `/chat/[id]` → 已有对话，路由切换时组件卸载重挂载，所有 local state（resumeData、showPreview、isExtracting 等）天然清零
- 只有 conversations 列表和主题等全局字段留在 Zustand store
- 新对话发送第一条消息后 → `window.history.replaceState` 更新 URL 为 `/chat/<new-id>`（用 `router.replace` 会触发页面重挂载、中断 SSE 流）

### 6. 模版系统

**上传：**
- 仅接受 PDF 文件
- mime type（`application/pdf`）+ 扩展名（`.pdf`）双重校验
- 单文件 ≤ 10MB

**存储：**
- 路径：`apps/server/public/uploads/templates/{uuid}.pdf`
- 元数据：同目录 `{uuid}.meta.json`
- ID 格式：UUID v4，由 `crypto.randomUUID()` 生成

**API 路由（`apps/server/src/routes/templates.ts`）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates` | 返回所有用户上传的模版列表 |
| POST | `/api/templates/upload` | 上传新模版 |
| GET | `/api/templates/[id]` | 预览（302 重定向到静态 PDF） |
| DELETE | `/api/templates/[id]` | 删除模版（仅管理员/仅用户上传的） |
| POST | `/api/templates/[id]/fill` | PDF 填充输出（pdf-lib 原位文字替换 + 自定义页） |
| GET | `/api/templates/[id]/extract-markdown` | MinerU PDF → Markdown 提取 |
| POST | `/api/templates/[id]/analyze` | AI 分析模版结构 |
| POST | `/api/templates/[id]/summary` | AI 提取简历标题和摘要 |

**预览/下载：**
- 预览：API 302 重定向 → `/uploads/templates/{id}.pdf`
- 下载：直接 `<a href="/uploads/templates/{id}.pdf" download>`
- iframe 片段（`#view=FitH`）不会随 302 传递，需在静态 URL 上加

### 7. 导航结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | 营销落地页，唯一 CTA 指向 `/chat` |
| `/chat` | AI 对话 | **核心入口**，对话式简历生成 |
| `/m/chat` | 移动端对话 | 移动端聊天界面 |
| `/resume/new?template=xxx` | 新建简历 | PDF 编辑器 |
| `/resume/list` | 简历列表 | 已保存简历 |
| `/resume/preview` | 独立预览 | 从 localStorage 读取数据渲染 |
| `/applications` | 投递记录 | 岗位投递管理 |
| `/login` | 登录 | GitHub / Authing / 微信 |

管理后台是独立 Next 应用 `apps/admin`（端口 3001），查看请求日志（`/logs`）。

### 后台权限体系（RBAC）

- **数据模型**：`roles`（内置 super_admin/admin/viewer + 自定义角色，permissions 为权限点 JSON 数组）、`user_roles`（用户↔角色）、`plans`/`user_plans`（套餐，收费地基）
- **权限点白名单**：`lib/auth/permissions.ts` 的 `ADMIN_PERMISSIONS`（admin.users/admin.logs/admin.traces/admin.permissions）为唯一事实源；角色 CRUD 经 `sanitizePermissions` 校验，**禁止授予通配 `*`**（仅内置 super_admin 持有）
- **防提权**：`admin.ts` 的 `assertRoleGrantsAllowed`——非超级管理员禁止授予含 `*` 或 `admin.permissions` 的角色；内置角色的 permissions 锁定不可修改（`permissions.ts` PUT /roles/:id）
- **添加人员**：权限管理页「用户授权」Tab（`apps/admin/src/app/permissions/user-grant.tsx`）支持**预建人员**（POST /api/admin/users 按 GitHub 用户名占位 + 分配角色/套餐），对方首次 GitHub 登录时 `auth.ts` callback 按 `githubLogin + githubId IS NULL` 命中并关联，权限即时生效；用户列表支持 `?q=` 搜索，预建用户标记 `pendingLogin`
- **超级管理员 bootstrap**：env `ADMIN_GITHUB_IDS` 白名单（dev mock githubId `00000000`）恒有通配权限，防止锁死

---

## 编辑器架构（核心）

这里只列 Agent 需要知道的关键点。

### 两层编辑模型

**Layer 1 — 模版页（逐块原位编辑）：**
- pdfjs-dist 客户端提取 PDF 文字块 → `RichTextBlock[]`（含坐标、字号、颜色）
- 右侧列表逐块 `<textarea>` 编辑，支持删除（导出时涂白不写字）
- 导出时坐标原样传给 fill API，pdf-lib 在相同位置覆盖文字

**Layer 2 — 自定义页（自由排版）：**
- 已简化：TipTap 富文本和「+ 添加页面」编辑 UI 已移除，仅保留 `CustomPage.markdown` 数据模型和 `fill` API 的 Part C 渲染逻辑
- 导出时 `parseHtmlToLines()` 解析为 TextLine（标题/列表/正文），从文字区域下方开始排版

### 坐标系统（重要！）

```
text-extractor.ts 提取 → PDF 原生坐标（y=0 在底部，往上递增）
fill API 接收        → 同上，不要做二次翻转
fill API 自定义页    → 从上到下排版，y 递减，触底自动分页
```

**常见 Bug：** fill API 中做 `pdfY = pageHeight - e.y - e.h` 是错的——因为 `e.y` 已经是 PDF 原生坐标，翻转会导致文字跑到底部。

### PDF 填充管线（`apps/server/src/routes/templates.ts` 的 fill）

```
1. 加载模版 PDF + 嵌入 CJK 字体 (apps/server/public/NotoSansSC-Regular.otf)
2. Part A — 模版页文字替换：
   Pass 1: 画所有白色矩形（覆盖原文，含 descender 余量）
   Pass 2: 画所有新文字（在所有遮罩之上）
3. Part B — 自定义页：
   - copyPages() 复制模版第一页
   - 涂白所有文字块
   - parseHtmlToLines() 解析 HTML → TextLine[]
   - 从文字区域下方逐行渲染，超出自动续页
4. 输出 apps/server/public/filled/{id}.pdf
```

**为什么两遍渲染：** 先画所有遮罩再画所有文字，避免后面的遮罩盖住前面的文字。

### 状态管理

- `apps/web/src/stores/chat-store.ts` — 对话状态：conversationId、messages、isStreaming、resumeData、quoteText、showPreview
- `apps/web/src/stores/editor-store.ts` — 编辑器状态：templateId、pdfUrl、markdown、customPages、resumeData、aiAnalysis

### 字体依赖

- PDF 填充需要 **`apps/server/public/NotoSansSC-Regular.otf`**（16MB CJK 字体），缺失则 fill API 500
- 字体已通过 jsDelivr CDN 下载到位，部署时需确认文件存在

---

## 架构决策

### 前后端分层

- **`apps/server`（Hono）** 承载全部后端：AI Agent、数据库、认证、PDF 填充、文件服务。本来就是 Node 环境，无需声明 `runtime = "nodejs"`。
- **`apps/web`（Next.js）** 纯客户端 + 页面，通过 rewrites 代理访问后端，无 API 实现。
- **`apps/admin`（Next.js）** 独立后台，端口隔离。

### 数据库 vs 本地文件

- **用户数据和简历内容** → 数据库（SQLite `apps/server/.db/local.db`，WAL 模式），表：users / conversations / messages / resumes / applications / request_logs / ai_traces / ai_spans / ai_events / roles / user_roles / plans / user_plans / token_usage / user_ai_apis
- **模版文件** → 本地文件系统 `apps/server/public/uploads/templates/`
- 原因：数据库不适合存储大文件，PDF 作为静态资源更高效

### 开发环境

- **`pnpm dev`** 而非 `wrangler dev`
  - `wrangler dev` 会尝试连接 Cloudflare 远程代理，本机因无有效 token 会失败
  - `pnpm dev` 通过 turbo 并行启动 server（tsx watch）+ web（next dev）+ admin
  - 本地数据库用 SQLite（`better-sqlite3`），数据在 `apps/server/.db/local.db`，启动时自动建表
- 环境变量分两处：`apps/server/.env.local`（后端）和 `apps/web/.env.local`（前端）。server 通过 `apps/server/src/env.ts` 手动加载 `.env` / `.env.local`（对齐 Next 的加载约定）。

### AI 调用

- 封装在 `apps/server/src/lib/ai/index.ts`
- 基于 OpenAI 兼容 SDK + LangGraph StateGraph
- 支持 DeepSeek v4 / 智谱 GLM-4-Plus 等模型
- 通过 `apps/server/.env.local` 切换 `OPENAI_BASE_URL` 和 `AI_MODEL`
- `LANGGRAPH_ENABLED === "true"` 走 Agent，否则回退原始 `ai.chat()`

### SSE 流式 vs gzip

`apps/web/next.config.ts` 设置 `compress: false`：Next 的 compression 中间件会缓冲 `text/event-stream`，破坏逐 token 流式输出。生产部署时 gzip 交给反向代理（Nginx），SSE 端点同样配置为不压缩。

### pdf-lib vs Canvas 截图

选择 pdf-lib 原位替换而非 Canvas 截图：
- pdf-lib 输出真 PDF，文字可选、可搜索、矢量无损
- 代价：需要嵌入 16MB CJK 字体，坐标计算需注意 PDF bottom-left 坐标系

---

## 关键文件索引

```
apps/
├── server/                                # Hono 后端（全部 API）
│   ├── src/
│   │   ├── index.ts                       # 入口（端口 8787）
│   │   ├── app.ts                         # 路由挂载（/api/*）
│   │   ├── env.ts                         # 手动加载 .env / .env.local
│   │   ├── db/
│   │   │   ├── schema.ts                  # Drizzle ORM Schema
│   │   │   └── index.ts                   # getDb()（better-sqlite3 + MIGRATIONS 自动建表/迁移）
│   │   ├── routes/
│   │   │   ├── health.ts                  # 健康检查
│   │   │   ├── auth.ts                    # 登录（GitHub / Authing / 微信）
│   │   │   ├── chat.ts                    # 对话 SSE + 历史/消息/开场白/提取/附件解析
│   │   │   ├── ai.ts                      # AI 分析/润色/摘要/改进/解析
│   │   │   ├── pdf.ts                     # PDF 工具（合并/拆分/旋转/OCR）
│   │   │   ├── templates.ts               # 模版 CRUD + fill 填充（核心）+ MinerU
│   │   │   ├── admin.ts                   # 管理 API（日志/用户/traces/usage/授权）
│   │   │   ├── permissions.ts             # RBAC 权限（角色/套餐 CRUD + meta 目录）
│   │   │   ├── applications.ts            # 投递记录 CRUD
│   │   │   ├── resume.ts                  # 简历 CRUD + render-skills
│   │   │   ├── byok.ts                    # 用户自带 API Key（BYOK）+ 连接测试
│   │   │   ├── usage.ts                   # 用户用量查询（platform/byok 拆分）
│   │   │   └── analysis.ts                # AI 简历分析结果
│   │   └── lib/
│   │       ├── ai/
│   │       │   ├── index.ts               # AI Agent 入口（createAgent 工厂）
│   │       │   ├── graph.ts               # LangGraph StateGraph（router → worker ↔ tools）
│   │       │   ├── tools.ts               # 工具注册（pushForm/extractResume/retrieveKnowledge）
│   │       │   ├── prompts.ts             # 系统提示词 + 提取提示词 + 开场白
│   │       │   ├── knowledge.ts           # RAG 知识库
│   │       │   ├── vectorstore.ts         # 自研向量存储（Embedding + 相似度）
│   │       │   ├── embeddings.ts          # Embedding 生成
│   │       │   └── attachment-parser.ts   # 附件解析（PDF/图片 → 文字）
│   │       ├── auth/                      # oidc / github / wechat / admin / permissions / utils / types
│   │       ├── billing/                   # pricing（价格快照）/ ledger（用量账本）/ byok（密钥加密）
│   │       ├── observability/             # AI trace 收集器（collector/context/persist）
│   │       ├── logging/request-logger.ts  # 请求日志
│   │       ├── rate-limit.ts              # 内存速率限制
│   │       ├── resume.schema.ts           # 简历 zod schema（服务端）
│   │       ├── skills-html.ts             # 技能分类渲染
│   │       └── theme-utils.ts             # 主题工具
│   └── public/
│       ├── NotoSansSC-Regular.otf         # CJK 字体（PDF 填充必需）
│       ├── pdf.worker.mjs                 # pdfjs worker
│       └── uploads/templates/             # 上传的模版 PDF
├── web/                                   # Next.js 客户端（页面 + UI）
│   └── src/
│       ├── app/
│       │   ├── page.tsx                   # 首页（营销落地页）
│       │   ├── layout.tsx                 # 根布局
│       │   ├── chat/
│       │   │   ├── layout.tsx             # 对话侧边栏（conversation 列表持久）
│       │   │   ├── page.tsx               # 新对话页
│       │   │   ├── [id]/page.tsx          # 已有对话页（路由隔离）
│       │   │   └── loading.tsx            # 路由切换 loading
│       │   ├── m/chat/                    # 移动端对话页
│       │   ├── resume/{new,list,preview}/ # 简历编辑器/列表/预览
│       │   ├── applications/              # 投递记录页
│       │   └── login/                     # 登录页
│       ├── proxy.ts                       # middleware（移动端 UA 分流）
│       ├── components/
│       │   ├── chat/                      # ChatContent/ChatHeader/ChatMessages/ChatInput/FormCard/ResumePreviewPanel/EditResumeForm/mobile
│       │   ├── preview/                   # PDF 预览 + 点击定位
│       │   ├── resume/                    # TemplateResume 统一渲染
│       │   └── templates/                 # 模版注册表 + classic 模版
│       ├── stores/                        # chat-store / editor-store（Zustand）
│       ├── hooks/                         # use-auth / use-device
│       └── lib/
│           ├── ai/prompts.ts              # 前端引用提示词常量
│           ├── api/                       # resume / templates API 客户端
│           ├── editor/html-parser.ts      # 文字块 ↔ HTML 互转
│           ├── pdf/                       # pdfjs 提取/MinerU/图片提取/模块识别/页面渲染
│           ├── utils/                     # sse / uuid / merge-data
│           └── validators/resume.schema.ts # 简历 zod schema（前端）
├── admin/                                 # Next.js 管理后台（端口 3001）
│   └── src/
│       ├── app/
│       │   ├── page.tsx                   # 用户管理（含角色/套餐授权）
│       │   ├── logs/page.tsx              # 请求日志监控
│       │   ├── traces/                    # AI Traces（列表 + 详情回放）
│       │   └── permissions/               # 权限管理（角色/套餐 + 用户授权 user-grant）
│       └── components/
│           ├── admin-shell.tsx            # 后台布局 + 按权限过滤导航
│           ├── admin-header.tsx           # 顶部栏
│           ├── usage-card.tsx             # 用量报表卡片
│           └── traces/trace-detail.tsx    # Trace 详情
├── shared/                                # 共享包 @resume/shared
│   └── src/
│       ├── schemas/resume.ts              # 简历 zod schema
│       ├── utils/uuid.ts                  # crypto.randomUUID 封装
│       └── utils/merge-data.ts            # 多来源 ResumeData 合并
├── ui/                                    # 共享 UI 包 @resume/ui
│   └── src/
│       ├── components/                    # button/card/dialog/input/select/tabs/... + app-header
│       ├── hooks/use-auth.ts              # 认证 hook
│       ├── lib/utils.ts                   # cn() 等工具
│       └── index.ts
└── config/                                # 共享配置 @resume/config
    ├── tsconfig.base.json
    ├── tsconfig.next.json
    └── tsconfig.node.json
```

## 常见问题

**Q: `pnpm dev` 报 Cloudflare API 错误？**
A: 不影响使用。那是 `@opennextjs/cloudflare` 在 `next dev` 时尝试连 Cloudflare 远程代理，本地不需要。忽略即可。

**Q: 前端请求 API 404？**
A: 确认 `apps/server` 已启动（`pnpm dev` 会并行启动，端口 8787），且 `apps/web/next.config.ts` 的 `rewrites()` 目标 `API_ORIGIN` 正确。

**Q: AI 回复不流式、等接口跑完才一次性显示？**
A: 检查 `apps/web/next.config.ts` 是否保持 `compress: false`。Next 的 gzip 压缩会缓冲 SSE 流，导致前端无法逐 token 渲染。

**Q: 上传 PDF 后预览不了？**
A: 确认 `pnpm dev` 而非 `wrangler dev`。API 路由用 302 重定向到 `/uploads/templates/{id}.pdf`。

**Q: PDF 填充报 "请先下载 CJK 字体"？**
A: 执行 `curl -L -o apps/server/public/NotoSansSC-Regular.otf https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`

**Q: 文字替换后位置偏移？**
A: 检查 fill API 是否做了 `pageHeight - y` 翻转——text-extractor 传过来的 y 已经是 PDF 原生坐标，不需要再翻转。

**Q: 如何新增一个 UI 组件？**
A: 在 `packages/ui/src/components/` 添加组件并从 `packages/ui/src/index.ts` 导出，前端用 `@resume/ui` 导入。shadcn 生成：`pnpm --filter @resume/ui dlx shadcn@latest add <component-name>`。

**Q: 如何切换 AI 模型？**
A: 修改 `apps/server/.env.local` 中的 `OPENAI_BASE_URL` 和 `AI_MODEL`。

**Q: 如何添加新的对话工具（tool）？**
A: 在 `apps/server/src/lib/ai/tools.ts` 中注册新的 LangGraph tool，然后在前端 `apps/web/src/components/chat/ChatMessages.tsx` 中添加对应的事件监听和处理逻辑。

**Q: 简历打印第二页背景是白的？**
A: `ResumePreviewPanel.tsx` 的 `beforeprint` 处理器会注入 `position: fixed` 背景层 + `globals.css` 的 `@media print` 规则中 `body::before` 也会铺满每页。如果还是不生效，检查打印对话框是否勾选「背景图形」。
