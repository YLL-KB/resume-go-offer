# Resume Go Offer

AI 驱动的简历制作与分析工具。支持上传 PDF 模版，在线编辑文字块，追加自定义页，导出真 PDF。

## 功能

- **PDF 模版编辑** — 上传 PDF 简历模版，自动提取文字块（坐标、字号、颜色），逐块原位编辑替换，保留原始排版
- **自定义追加页** — 支持新增页面，继承模版视觉风格（边框、线条、装饰），用富文本编辑器自由填写内容
- **真 PDF 导出** — pdf-lib + CJK 字体嵌入，输出文字可选中的真 PDF（非截图）
- **AI 分析** — AI 评分 + 优缺点分析 + 改进建议 + 简历润色
- **模版管理** — 上传/预览/下载/删除 PDF 模版，AI 自动提取标题和摘要

## 技术栈

| 层 | 技术 |
|-----|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript |
| UI | shadcn/ui + Tailwind CSS + TipTap 富文本 |
| PDF 解析 | pdfjs-dist（文字块提取）+ react-pdf（预览） |
| PDF 生成 | pdf-lib + @pdf-lib/fontkit（CJK 字体嵌入） |
| 数据库 | Cloudflare D1（本地: SQLite fallback） |
| AI | OpenAI 兼容 SDK（DeepSeek / 通义千问 / GPT） |
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

## 编辑器架构

```
上传 PDF 模版
    │
    ▼
pdfjs-dist 提取文字块 ──► 模版页逐块编辑（textarea 原位替换 / 删除涂白）
    │
    ▼
点击「+ 添加页面」──► 复制模版底版 → 涂白原文 → TipTap 富文本自由编辑
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
│   ├── resume/new/
│   │   ├── page.tsx                    # 新建简历页
│   │   └── ResumeNewContent.tsx        # 编辑器主组件（页签、导出）
│   ├── templates/page.tsx              # 模版管理
│   ├── analyze/page.tsx                # AI 简历分析
│   └── api/
│       ├── templates/                  # 模版 CRUD + AI 摘要
│       │   └── [id]/
│       │       ├── fill/route.ts       # PDF 填充输出（核心）
│       │       └── extract-markdown/   # MinerU 提取
│       ├── ai/                         # AI 分析/润色
│       └── resume/                     # 简历 CRUD
├── components/
│   ├── ui/                             # shadcn/ui 组件
│   ├── editor/
│   │   ├── RichTextEditor.tsx          # TipTap 富文本编辑器
│   │   └── extensions/                # 自定义扩展（字号/缩进）
│   ├── preview/                        # PDF 预览组件
│   ├── resume/                         # 结构化表单组件
│   └── templates/                      # 模版渲染组件
├── stores/
│   └── editor-store.ts                # 编辑器全局状态（Zustand）
├── lib/
│   ├── pdf/
│   │   ├── text-extractor.ts           # pdfjs-dist 文字块提取
│   │   ├── mineru-extractor.ts         # MinerU 客户端封装
│   │   ├── image-extractor.ts          # PDF 图片提取
│   │   └── page-renderer.ts            # Canvas 页面渲染
│   ├── ai/index.ts                     # AI SDK 封装
│   ├── auth/                           # Authing OIDC
│   ├── db/                             # Drizzle ORM + D1/SQLite
│   └── validators/                     # Zod 校验
└── types/
    └── mineru-open-sdk.d.ts            # MinerU SDK 类型声明
```

## 页面导航

| 路径 | 说明 |
|------|------|
| `/` | 首页 |
| `/resume/new?template=xxx` | 新建简历，选择模版后进入编辑器 |
| `/resume/[id]` | 简历预览 |
| `/resume/[id]/edit` | 编辑已有简历 |
| `/analyze` | AI 简历分析评分 |
| `/templates` | 模版管理（上传、预览、下载、删除） |

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
