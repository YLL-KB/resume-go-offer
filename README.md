# Resume Go Offer

跟 AI 聊聊你的经历，一份专业简历就出来了。AI 驱动的对话式简历生成工具，聊完直接导出 PDF。

## 功能

- **AI 对话式简历** — 像跟朋友聊天一样告诉 AI 你的工作经历、技能、项目，AI 主动追问细节，用 STAR 法则优化文案
- **Agent 工作流** — LangGraph + LangChain 驱动的多轮对话 Agent，自动推送表单卡片收集信息，聊完一键提取生成简历
- **实时预览** — 右侧面板实时预览简历排版，支持打印导出 PDF（背景图形完整）
- **简历亮点捕捉** — AI 在对话中自动识别用户硬核战绩、稀缺能力、个人特质，生成「个人亮点」卡片
- **PDF 编辑器** — 上传 PDF 简历模版，自动提取文字块，原位编辑替换，追加自定义页，输出文字可选中的真 PDF
- **对话历史管理** — 多轮对话持久化，支持重命名、删除、切换历史记录

## 项目结构（pnpm Monorepo）

```
resume-go-offer/
├── apps/
│   ├── server/           # Hono 后端（全部 API，端口 8787）
│   ├── web/              # Next.js 客户端（端口 3000）
│   └── admin/            # Next.js 管理后台（端口 3001）
├── packages/
│   ├── shared/           # 共享 zod schema + 工具（uuid / merge-data）
│   ├── ui/               # 共享 shadcn/ui 组件库 + use-auth
│   └── config/           # 共享 tsconfig 配置
├── package.json          # pnpm workspace + Turborepo 根脚本
├── pnpm-workspace.yaml
└── turbo.json
```

前后端通过 **Next.js rewrites** 打通：`apps/web` 的 `/api/*` 请求被代理到 `http://localhost:8787/api/*`，前端代码里没有 API 路由实现。

## 技术栈

| 层 | 技术 |
|-----|------|
| Monorepo | pnpm workspace + Turborepo |
| 后端 | Hono 4 + `@hono/node-server`（TypeScript + tsx） |
| 前端 | Next.js 16 (App Router) + React 19 |
| 后台 | Next.js 16（独立 app，端口 3001） |
| UI | shadcn/ui + Tailwind CSS v4 + Framer Motion（封装在 `packages/ui`） |
| AI Agent | LangGraph + LangChain + OpenAI 兼容 SDK（GPT-4o-mini / 智谱 GLM-4 等） |
| 向量检索 | 自研 VectorStore + Embedding RAG（简历写作知识库检索） |
| PDF 解析 | pdfjs-dist（文字块提取）+ react-pdf（预览） |
| PDF 生成 | pdf-lib + @pdf-lib/fontkit（CJK 字体嵌入） |
| 状态管理 | Zustand（chat-store / editor-store） |
| 数据库 | SQLite (better-sqlite3) / Cloudflare D1 + Drizzle ORM |
| 认证 | GitHub OAuth / Authing OIDC / 微信 |
| 部署 | VPS + PM2（`./deploy.sh`） |
| 包管理 | pnpm |

## 快速开始

```bash
git clone <repo-url>
cd resume-go-offer
pnpm install
```

### 环境变量

环境变量分两处（各 app 独立加载自己的 `.env.local`）：

- **后端 `apps/server/.env.local`** — AI 模型、数据库、认证、MinerU 等
- **前端 `apps/web/.env.local`** — `NEXT_PUBLIC_*`、Sentry 等

```env
# ── apps/server/.env.local ──
# AI 大模型（OpenAI / DeepSeek / 智谱 GLM 等兼容 API）
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
ROUTER_MODEL=glm-4-flash

# 启用 LangGraph Agent 模式
LANGGRAPH_ENABLED=true

# 登录（GitHub OAuth / Authing OIDC / 微信）
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
AUTHING_APP_ID=
AUTHING_APP_SECRET=
AUTHING_ISSUER=
WECHAT_APP_ID=
WECHAT_APP_SECRET=

# 可选: 简历提取专用模型（未设则复用 OPENAI_*）
# AI_EXTRACT_API_KEY=
# AI_EXTRACT_BASE_URL=
# AI_EXTRACT_MODEL=

# 可选: 视觉模型（岗位截图解析）
# AI_VISION_MODEL=

# 可选: 智谱 API（图片解析）
# ZHIPU_API_KEY=

# 可选: MinerU PDF 提取（不设则用 Flash 模式）
MINERU_TOKEN=

# 可选: LangSmith 调试
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
```

```env
# ── apps/web/.env.local ──
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 后端地址（rewrites 代理目标，默认 localhost:8787）
# API_ORIGIN=http://localhost:8787

# 可选: Sentry 错误监控
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_AUTH_TOKEN=
```

### 下载 CJK 字体（PDF 导出必需）

```bash
curl -L -o apps/server/public/NotoSansSC-Regular.otf \
  https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
```

### 启动开发服务器

```bash
pnpm dev
```

Turborepo 并行启动三个应用：

| 应用 | 地址 | 说明 |
|------|------|------|
| web | http://localhost:3000 | 前端主入口 |
| server | http://localhost:8787 | Hono API 服务 |
| admin | http://localhost:3001 | 管理后台 |

> ⚠️ 不要用 `wrangler dev`，参见 [AGENTS.md](./AGENTS.md) 说明。

### 本地数据库

本地开发使用 SQLite（`better-sqlite3`），数据文件在 `apps/server/.db/local.db`。首次启动时由 `apps/server/src/db/index.ts` 里的 `MIGRATIONS` 数组自动建表，**无需手动初始化或执行 migration**。数据库目录可通过 `DATABASE_DIR` 环境变量覆盖。

## 架构

### AI 对话流程

```
用户说话
    │
    ▼
apps/web 输入框 ──► rewrites 代理 ──► apps/server POST /api/chat
    │                                      │
    │                                      ▼
    │                          LangGraph Agent ──► 工具调用（pushForm / extractResume / retrieveKnowledge）
    │                                      │
    ▼                                      ▼
SSE Streaming ◄────────────────────── 逐 token 推送
    │
    ▼
前端实时渲染 Markdown + 表单卡片
    │
    ▼
收集完整信息 ──► extractResume() ──► 生成简历 JSON ──► 预览面板
```

### PDF 编辑器流程

```
上传 PDF 模版
    │
    ▼
pdfjs-dist 提取文字块 ──► 逐块原位编辑（textarea 替换 / 删除涂白）
    │
    ▼
「+ 添加页面」──► 复制模版底版 → 涂白原文 → Markdown 文本编辑
    │
    ▼
生成预览 ──► fill API (pdf-lib) ──► 合并输出真 PDF
```

## 页面导航

| 路径 | 说明 |
|------|------|
| `/` | 首页 |
| `/chat` | 新对话（发送后自动跳转至 `/chat/[id]`） |
| `/chat/[id]` | 已有对话（核心入口，路由隔离） |
| `/m/chat` | 移动端对话 |
| `/resume/new?template=xxx` | 新建简历编辑器 |
| `/resume/list` | 简历列表 |
| `/resume/preview` | 独立简历预览页 |
| `/applications` | 投递记录 |
| `/login` | GitHub / Authing / 微信登录 |

管理后台是独立 Next 应用（`apps/admin`，端口 3001），用于查看请求日志。

## 开发规范

详见 [AGENTS.md](./AGENTS.md)，核心规则：

- **返回按钮** 统一 `router.back()`，不硬编码链接
- **UI 组件** 全部用 `packages/ui`（`@resume/ui`）里的 shadcn/ui 组件，禁用原生 HTML
- **共享 schema/工具** 放 `packages/shared`（`@resume/shared`），避免前后端各自维护一份
- **API 路由** 全部在 `apps/server`（Hono），`apps/web` 不写 API 实现
- **模版上传** 仅 PDF，≤10MB，UUID v4 命名
- **文件服务** 优先用 `apps/server/public/` 静态文件 + 302 重定向，不用 `fs.readFile`

## 部署

```bash
./deploy.sh   # 即 pnpm deploy:vps
```

部署到 VPS（`root@47.116.46.77`），脚本自动完成 push/pull、依赖安装、构建、PM2 重启。详见 [DEPLOY.md](./DEPLOY.md)。

## 相关文档

- [AGENTS.md](./AGENTS.md) — Agent/开发者指南
- [TECH-STACK.md](./TECH-STACK.md) — 技术栈说明
- [docs/AI-AGENT.md](./docs/AI-AGENT.md) — AI Agent 技术文档
- [DEPLOY.md](./DEPLOY.md) — 部署与运维指南
