# 技术选型决策记录（Why This Stack）

> 本文档回答「为什么选这项技术」，与 `TECH-STACK.md`（讲「每类技术是什么、负责什么、代码在哪」）互补。
> 每一条都标注了选型的核心约束与权衡点，方便后人判断「这个选择今天是否仍然成立」。

---

## 0. 选型总纲

一句话：**用最省运维的存储（SQLite）+ 最轻的框架（Hono）+ 最强的 AI 编排（LangGraph），套在统一类型的 monorepo（pnpm + Turbo + TS + Zod）上。**

所有技术选型都围绕三个硬约束展开：

1. **AI 流式对话** —— 核心是 `POST /api/chat` 的 SSE 逐 token 输出，框架必须原生支持流式。
2. **简历文档处理** —— PDF/Word 解析 + 原位编辑 + 导出。
3. **单机 VPS 部署** —— 目标是一台 `root@47.116.46.77` 的 VPS（非 Cloudflare），运维成本要极低。

不是追新，每个选择都为这三个约束服务。

---

## 1. Monorepo：pnpm + Turbo

**为什么选：** 前后端、后台、共享类型/组件天然要拆成多个包，但又需要「改一处、全局生效」。pnpm workspace + Turbo 是 Node 生态里做 monorepo 最顺手的组合。

- `packages/shared`（Zod 简历 schema）、`packages/ui`（Radix 组件）被 web/admin/server 三处复用，避免重复维护。
- **pnpm 相对 npm/yarn**：硬链接省磁盘、装得快、lock 稳定。
- **Turbo 相对 nx**：配置极简（`turbo.json` 几个 task），缓存 + 并行够用，不引入 nx 的项目图复杂度。

**权衡：** 前端 Next.js 本身也是「一个仓库一个 app」的模型，理论上可以不用 monorepo；但共享类型（简历 schema 前后端一致）是刚需，monorepo 是拿它换来的最直接收益。

---

## 2. 后端：Hono（而非 Express/Fastify/Nest）

**为什么选（关键）：** 这个项目的核心是 **SSE 流式聊天**。Express/Fastify 对流式要写不少样板，而 Hono：

- **原生支持 ReadableStream / SSE**，`c.body(stream)` 一行返回流，贴合「AI 逐 token 输出」的核心场景。
- **TypeScript-first、零依赖核心**，类型推断贯穿 handler（对比 Express 的 `req/res` 弱类型）。
- **多运行时**：现在跑 Node（`@hono/node-server`），将来若要迁 Cloudflare Workers / 边缘，代码几乎不用改。这给了「保留迁边缘的选择权」，但不强迫现在迁。

**为什么不选 Nest：** Nest 的 DI/装饰器体系对这个规模的 API 是过度设计，且流式响应反而不如 Hono 直接。

**权衡：** Hono 生态比 Express 小，部分中间件要自己写（本项目里 `request-logger`、`rate-limit` 都是自研，代价可接受）。

---

## 3. 前端/后台：Next.js 16 + React 19（两个独立 app）

**为什么选：**
- 简历产品需要 SEO / 首屏快，Next 的 App Router + RSC 兼顾 SSR 与交互。
- **web（用户端）** 重交互（简历编辑器、对话流、PDF 预览/下载），**admin（后台）** 是内部工具（日志/trace 查询、统计面板）。两者都是 Next，保持技术栈统一，团队不用维护两套前端框架。
- React 19 是 Next 16 默认搭档，`use`、`useActionState` 等新特性直接可用。

**权衡：** admin 后台其实可以用更轻的方案（如 vite + react-admin），但「统一技术栈、复用 `packages/ui`」的收益大于「少一个依赖」的收益。

---

## 4. 存储：SQLite（better-sqlite3 + Drizzle ORM）

**为什么选：**
- **零运维、数据主权**：单文件数据库，VPS 一个目录就能跑，不用单独起 MySQL/Postgres 进程。对「单机 VPS 部署」是最省心的选择。
- **WAL 模式** + `MIGRATIONS` 幂等 SQL 数组，每次启动自动建表/补列，省掉独立迁移工具。
- **Drizzle 相对 Prisma**：更轻、类型推断更贴 SQLite、SQL-first（方便手写日志统计/trace 分组的聚合查询）；Prisma 对 SQLite 支持偏重、冷启动开销大。

**权衡：** SQLite 并发写能力有限。但本项目是单机、写多读少、并发低，够用；且保留了「迁 Cloudflare D1」的路径（`getDb()` 已兼容 D1，只是当前生产走 SQLite）。

---

## 5. AI 编排：LangGraph + LangChain（核心）

**为什么选：** 项目本质是「简历顾问 Agent」——不是简单问答，而是有状态、有工具、有循环的对话流程。

- **2-Agent 架构**：`router`（glm-4-flash 快速分类意图）→ `worker`（按 mode 选模型 + 调工具 + 生成回复）。这是「小模型路由 + 大模型执行」的降本提速套路。
- **LangGraph 提供状态机**：`router → worker ↔ tools` 带循环的图，用 `StateGraph` + `conditionalEdges` 表达最自然，且自带 `streamEvents` 支持 token 级流式（SSE 靠它）。
- **LangChain 提供统一抽象**：`ChatOpenAI` 兼容类、`ToolNode`、`bindTools`，模型/工具切换不散架。

**为什么不手写编排：** 手写一个 `while tool_calls` 循环也能跑，但状态管理、事件流、防死循环（`iterationCount`）这些边角 LangGraph 已经踩过坑，直接复用更稳。

---

## 6. 模型接入：OpenAI 兼容 SDK + 国产模型

**为什么选：** 用 OpenAI SDK（`openai` + `@langchain/openai`），但实际打 **智谱 GLM** 和 **DeepSeek**——两者都提供 OpenAI 兼容接口，**一套代码通吃**。

| 模型 | 角色 | 为什么 |
|---|---|---|
| **glm-4-flash** | router / 快 worker | 便宜、快，负责高频意图分类和闲聊 |
| **glm-4-plus** | 质量 worker | 质量高，负责润色/生成这类重活 |
| **deepseek-chat** | extract 提取 | `AI_EXTRACT_BASE_URL` 单独指向，便宜且结构化抽取强 |

**为什么不锁死一家模型：** OpenAI 兼容接口 + 环境变量切换（`ROUTER_MODEL`/`AI_MODEL`/`AI_EXTRACT_BASE_URL`），让模型可随时替换，避免供应商绑定。

---

## 7. 认证：Authing OIDC + GitHub OAuth + 匿名

**为什么选：**
- 目标用户（国内求职者）用 **Authing**（国内身份云，微信/手机号登录方便，不引 SDK、手写 OIDC 流程）。
- **GitHub OAuth** 给开发者/海外用户备用。
- **匿名用户** 用 `anon_id` cookie 持久化身份，未登录也能先聊、换 IP 不丢对话（降低获客门槛）。
- 全部收敛到统一的 `getAuthUserId()`，业务层不关心底层是哪种登录。

---

## 8. UI：Tailwind CSS 4 + shadcn/ui + Radix

**为什么选：**
- Tailwind 4 原子化 CSS，写 UI 快、体积小。
- shadcn/ui 是「复制组件源码」模式（不是黑盒依赖），配 Radix headless 组件（无障碍、交互逻辑全包），**样式完全可控**——适合简历编辑器这种定制度高的界面。
- `packages/ui` 统一封装，web/admin 共用一套设计系统。

**权衡：** shadcn 需要「复制进仓库」的维护成本（升级要手动同步），但换来完全可改的样式，对定制化 UI 值得。

---

## 9. 校验/类型：Zod 4

**为什么选：** 校验 + 类型二合一。`packages/shared` 用 Zod 定义简历 schema，前后端同一条校验规则，避免「前端和后端字段定义不一致」的经典坑（`z.infer` 生成 TS 类型）。

---

## 10. PDF/Word 处理栈

| 技术 | 用途 | 为什么 |
|---|---|---|
| **pdfjs-dist** | 解析 PDF 简历（提取文字块给 AI） | 纯 JS、浏览器/服务端都能跑、生态最成熟 |
| **pdf-lib + fontkit** | 生成/回填 PDF、嵌 CJK 字体 | 轻量、纯 JS、无原生依赖 |
| **mammoth** | 解析 `.docx` → HTML | 专注 Word，处理附件上传 |
| **mineru-open-sdk** | 复杂排版文档解析 | 降级链最高精度档，fallback 到本地 pdfjs |
| **jspdf / html2canvas / html-to-image** | 前端 HTML → 图片/PDF 导出 | 预览截图场景 |

**权衡：** PDF 原位编辑是「pdfjs 提取 + pdf-lib 回填」的组合拳，比直接用 Canvas 渲染更可控、文字可选中（真 PDF）。

---

## 11. 可观测性

- **Sentry（`@sentry/nextjs`）**：前端异常告警，补足异常捕获层。
- **自研 request-logger + AI trace 三表**：见 `TECH-STACK.md` §10 与 `docs/`，捕获请求元数据 + AI 节点级 trace + 降级事件（LangSmith 分层只做 dev 调试/生产采样）。

**为什么自建 trace 而非纯 LangSmith：** 数据主权 + 零额外延迟/成本 + 字段贴合业务（mode/model/token/降级事件），生产主账本落在自己的 SQLite 里。

---

## 12. 选型原则总结

1. **为约束服务，不追新** —— 每个技术都要能回答「它解决了 AI 流式 / PDF 处理 / 单机部署里的哪个问题」。
2. **保留迁移路径，不锁死** —— Hono 可迁边缘、Drizzle 可迁 D1、模型可换供应商，但当前都用最省事的那档。
3. **复用 > 引入** —— 共享包（shared/ui）优先于重复实现；能自研的小中间件（日志/限流）不引大依赖。
4. **零运维优先** —— SQLite 单文件、PM2 单进程、幂等 SQL 迁移，都是「一台 VPS 能扛」的最小运维单元。
