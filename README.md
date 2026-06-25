# Resume Go Offer

AI 驱动的简历制作与分析工具。

## 功能

- **简历制作** — 分步表单填写，实时预览，支持 PDF 导出
- **简历分析** — AI 评分 + 优缺点分析 + 改进建议
- **模版管理** — 上传/预览/删除 PDF 模版，AI 自动提取标题和摘要

## 技术栈

| 层 | 技术 |
|-----|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| 数据库 | Cloudflare D1 (本地开发: wrangler d1) |
| AI | OpenAI 兼容 SDK（DeepSeek / 通义千问 / GPT） |
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
# AI 服务
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat

# 可选: LangSmith 调试
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
```

### 启动开发服务器

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

> ⚠️ 不要用 `wrangler dev`，参见 [AGENTS.md](./AGENTS.md) 说明。

### 启动本地 D1 数据库

```bash
npx wrangler d1 execute resume-go-offer-db --local --file=./drizzle/0000_freezing_famine.sql
```

## 项目结构

```
src/
├── app/
│   ├── page.tsx                    # 首页
│   ├── layout.tsx                  # 根布局
│   ├── resume/
│   │   ├── new/page.tsx            # 新建简历（左表单 + 右预览）
│   │   └── [id]/
│   │       ├── page.tsx            # 简历预览
│   │       └── edit/page.tsx       # 编辑简历
│   ├── templates/page.tsx          # 模版管理
│   ├── analyze/page.tsx            # AI 简历分析
│   └── api/
│       ├── templates/              # 模版 CRUD + AI 摘要
│       └── ai/                     # AI 分析/润色接口
├── components/
│   ├── ui/                         # shadcn/ui 组件
│   └── resume/                     # 简历编辑器组件
├── hooks/
│   └── use-resume-form.ts          # 简历表单状态
└── lib/
    ├── ai/index.ts                 # AI SDK 封装
    └── validators/                 # Zod 校验
```

## 页面导航

| 路径 | 说明 |
|------|------|
| `/` | 首页 |
| `/resume/new` | 新建简历，支持 `?template=xxx` 选择模版 |
| `/resume/[id]` | 简历预览 |
| `/resume/[id]/edit` | 编辑已有简历 |
| `/analyze` | AI 简历分析评分 |
| `/templates` | 模版管理（上传、预览、删除） |

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
npx wrangler deploy
```

需要先在 Cloudflare Dashboard 创建 D1 数据库并配置 `wrangler.toml`。
