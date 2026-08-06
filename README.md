# Resume Go Offer

跟 AI 聊聊你的经历，一份专业简历就出来了。AI 驱动的对话式简历生成工具，聊完直接导出 PDF。

## 功能

- **AI 对话式简历** — 像跟朋友聊天一样告诉 AI 你的工作经历、技能、项目，AI 主动追问细节，用 STAR 法则优化文案
- **Agent 工作流** — LangGraph + LangChain 驱动的多轮对话 Agent，自动推送表单卡片收集信息，聊完一键提取生成简历
- **实时预览** — 右侧面板实时预览简历排版，支持打印导出 PDF（背景图形完整）
- **简历亮点捕捉** — AI 在对话中自动识别用户硬核战绩、稀缺能力、个人特质，生成「个人亮点」卡片
- **PDF 编辑器** — 上传 PDF 简历模版，自动提取文字块，原位编辑替换，追加自定义页，输出文字可选中的真 PDF
- **对话历史管理** — 多轮对话持久化，支持重命名、删除、切换历史记录

## 技术栈

| 层 | 技术 |
|-----|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 + Framer Motion |
| AI Agent | LangGraph + LangChain + OpenAI 兼容 SDK（智谱 GLM-4 / DeepSeek v4） |
| 向量检索 | 自研 VectorStore + Embedding RAG（技术文档问答） |
| PDF 解析 | pdfjs-dist（文字块提取）+ react-pdf（预览） |
| PDF 生成 | pdf-lib + @pdf-lib/fontkit（CJK 字体嵌入） |
| 富文本 | TipTap + 自定义扩展（字号/缩进） |
| 状态管理 | Zustand（chat-store / editor-store） |
| 数据库 | Cloudflare D1 + Drizzle ORM |
| 认证 | Authing OIDC |
| 部署 | OpenNext + Cloudflare Workers |
| 包管理 | pnpm |

## 快速开始

```bash
git clone <repo-url>
cd resume-go-offer
pnpm install
```

### 环境变量

复制 `.env.local.example` 为 `.env.local`，填入配置：

```env
# 认证 (Authing OIDC)
AUTHING_APP_ID=your-app-id
AUTHING_APP_SECRET=your-app-secret
AUTHING_ISSUER=https://your-tenant.authing.cn

# 应用地址
NEXT_PUBLIC_APP_URL=http://localhost:3000

# AI 服务
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat

# 可选: MinerU PDF 提取（不设则用 Flash 模式）
MINERU_TOKEN=

# 可选: LangSmith 调试
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
```

### 下载 CJK 字体（PDF 导出必需）

```bash
curl -L -o public/NotoSansSC-Regular.otf \
  https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
```

### 启动开发服务器

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

> ⚠️ 不要用 `wrangler dev`，参见 [AGENTS.md](./AGENTS.md) 说明。

### 初始化本地 D1 数据库

```bash
npx wrangler d1 execute resume-go-offer-db --local --file=./drizzle/0000_freezing_famine.sql
```

## 架构

### AI 对话流程

```
用户说话
    │
    ▼
LangGraph Agent ──► 工具调用（pushForm / extractResume / suggestOptimization）
    │
    ▼
SSE Streaming ──► 前端实时渲染 Markdown + 表单卡片
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
「+ 添加页面」──► 复制模版底版 → 涂白原文 → TipTap 富文本自由编辑
    │
    ▼
生成预览 ──► fill API (pdf-lib) ──► 合并输出真 PDF
```

详细设计文档：[EDITOR-DESIGN.md](./EDITOR-DESIGN.md)

## 项目结构

```
src/
├── app/
│   ├── page.tsx                        # 首页
│   ├── layout.tsx                      # 根布局
│   ├── chat/
│   │   ├── layout.tsx                  # 对话侧边栏 layout
│   │   ├── page.tsx                    # 新对话页
│   │   ├── [id]/page.tsx               # 已有对话页（路由隔离）
│   │   └── loading.tsx
│   ├── resume/
│   │   ├── new/                        # 新建简历（编辑器）
│   │   ├── edit/                       # 编辑已有简历
│   │   ├── builder/                    # 手动填表（遗留）
│   │   └── preview/                    # 简历预览页
│   └── api/
│       ├── chat/                       # 对话 API（SSE Streaming）
│       │   ├── route.ts                # 主对话
│       │   ├── history/                # 对话历史 CRUD
│       │   ├── messages/               # 历史消息
│       │   ├── extract/route.ts        # 简历提取
│       │   └── parse-attachment/       # 附件解析
│       ├── templates/                  # 模版 CRUD + PDF 填充
│       │   └── [id]/
│       │       ├── fill/route.ts       # PDF 填充输出（核心）
│       │       └── extract-markdown/   # MinerU 提取
│       ├── ai/                         # AI 分析/润色
│       ├── resume/                     # 简历 CRUD
│       └── pdf/                        # PDF 工具（合并/拆分/旋转/OCR）
├── components/
│   ├── ui/                             # shadcn/ui 组件
│   ├── chat/
│   │   ├── ChatContent.tsx             # 聊天主体（路由隔离核心）
│   │   ├── ChatHeader.tsx              # 对话页顶栏
│   │   ├── ChatMessages.tsx            # 消息列表 + 气泡
│   │   ├── ChatInput.tsx               # 输入框 + 发送 + 附件
│   │   ├── FormCard.tsx                # 结构化表单卡片
│   │   ├── ResumePreviewPanel.tsx      # 简历预览面板（侧边）
│   │   └── EditResumeForm.tsx          # 简历编辑表单
│   ├── editor/                         # TipTap 富文本编辑器 + 扩展
│   ├── preview/                        # PDF 预览组件
│   ├── resume/                         # 简历模板组件（Modern / Classic）
│   └── templates/                      # 模版渲染注册表
├── stores/
│   ├── chat-store.ts                   # 对话状态（Zustand）
│   └── editor-store.ts                 # 编辑器全局状态（Zustand）
├── lib/
│   ├── ai/
│   │   ├── index.ts                    # AI Agent 入口
│   │   ├── graph.ts                    # LangGraph StateGraph
│   │   ├── tools.ts                    # 工具注册
│   │   ├── prompts.ts                  # 系统提示词 + 提取提示词
│   │   ├── knowledge.ts                # RAG 知识库
│   │   ├── vectorstore.ts              # 自研向量存储
│   │   ├── embeddings.ts               # Embedding 生成
│   │   └── attachment-parser.ts        # 附件解析
│   ├── pdf/                            # pdfjs / MinerU / 图片提取
│   ├── auth/                           # Authing OIDC
│   ├── db/                             # Drizzle ORM + D1/SQLite
│   └── validators/                     # Zod 校验
└── types/
    └── mineru-open-sdk.d.ts
```

## 页面导航

| 路径 | 说明 |
|------|------|
| `/` | 首页 |
| `/chat` | 新对话（发送后自动跳转至 `/chat/[id]`） |
| `/chat/[id]` | 已有对话（核心入口，路由隔离） |
| `/resume/new?template=xxx` | 新建简历编辑器 |
| `/resume/builder` | 手动填表（遗留功能） |
| `/resume/preview` | 独立简历预览页 |
| `/login` | Authing OIDC 登录 |

## 开发规范

详见 [AGENTS.md](./AGENTS.md)，核心规则：

- **返回按钮** 统一 `router.back()`，不硬编码链接
- **UI 组件** 全部用 `@/components/ui/`，禁用原生 HTML
- **API 路由** 需要 Node.js 的加 `export const runtime = "nodejs"`
- **模版上传** 仅 PDF，≤10MB，UUID v4 命名
- **文件服务** 优先用 `public/` 静态文件 + 302 重定向，不用 `fs.readFile`

## 部署

```bash
pnpm build
opennextjs-cloudflare build
pnpm deploy
```

需要先在 Cloudflare Dashboard 创建 D1 数据库和 KV 命名空间，详见 [DEPLOY.md](./DEPLOY.md)。

## 相关文档

- [AGENTS.md](./AGENTS.md) — Agent/开发者指南
- [EDITOR-DESIGN.md](./EDITOR-DESIGN.md) — 编辑器架构设计
- [DEPLOY.md](./DEPLOY.md) — 部署与运维指南
