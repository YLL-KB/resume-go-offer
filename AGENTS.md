# AGENTS.md — Resume Go Offer

## 项目信息

- **项目根：** `/Users/loong/code/resume-go-offer`
- **框架：** Next.js 16 App Router
- **数据库：** Cloudflare D1（本地开发用 wrangler d1）
- **包管理：** `pnpm`
- **开发命令：** `pnpm dev`（端口 3000）
- **构建命令：** `pnpm build`

## 启动流程

每次在这个项目工作时，先确认：

```bash
cd /Users/loong/code/resume-go-offer
pnpm dev   # 非 wrangler dev。wrangler dev 会连 Cloudflare 远程代理，本机无需
```

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

页面内所有交互 UI 必须使用 `@/components/ui/` 中的 shadcn/ui 组件，禁止使用原生 HTML 交互标签。

**可用组件：**
`Button` `Card` `CardContent` `Dialog` `DialogContent` `DialogHeader` `DialogTitle` `DialogDescription` `DialogFooter` `Badge` `Skeleton` `Separator` `Sheet` `Input` `Label` `ScrollArea`

| 标签 | 规则 |
|------|------|
| `div` | 仅做布局容器 |
| `p` `span` `h1`~`h6` | 仅做纯文本排版 |
| `button` `input` `select` `textarea` | ❌ 禁止，用 UI 组件替代 |
| `iframe` | 仅 PDF 预览可用，外层必须用 `Dialog` 包裹 |
| `nav` `header` `main` `footer` `section` | ❌ 禁止，用 `div` + className |

```tsx
// ✓ 正确
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

// ✗ 错误
<button>提交</button>
<div className="modal">...</div>
<span className="tag">推荐</span>
```

### 3. 组件规模与新增规则

- **每个组件文件不超过 600 行。** 超过则拆分：抽 hooks → `hooks/`、拆子组件 → 同目录、提工具函数 → `lib/`。
- **新增组件必须使用 shadcn/ui + Tailwind CSS。** 禁止原生 `<button>` `<input>` `<select>` `<textarea>` `<nav>` `<header>` `<footer>` `<section>` 等交互/语义标签，禁止 inline `style={{}}`（动态计算除外），禁止自定义 CSS（`@media print` 等用 Tailwind `print:` 变体，`@page` 等用 `@layer base`）。
- **所有代码必须通过 ESLint 检查。** 提交前确保 `pnpm lint` 零错误零警告。禁止提交带有 `@typescript-eslint/no-unused-vars`、`react-hooks/exhaustive-deps` 等警告的代码。
- **以上规则适用于 `src/` 下所有组件文件，无例外。**

### 4. API 路由

```ts
// 每个需要 Node.js 运行时（fs、path 等）的 API 路由顶部必须声明：
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

**注意事项：**
- `fs.readFile` 在 OpenNext workerd 下可能直接失败
- 需要提供文件的 API → 优先用 `public/` 目录作为静态文件服务
- 需要返回 PDF → API 路由做 302 重定向到 `/uploads/xxx.pdf`，不在路由内读文件响应
- 文件修改后 Next.js 热更新自动生效，无需重启

### 5. 模版系统

**上传：**
- 仅接受 PDF 文件
- mime type（`application/pdf`）+ 扩展名（`.pdf`）双重校验
- 单文件 ≤ 10MB

**存储：**
- 路径：`public/uploads/templates/{uuid}.pdf`
- 元数据：同目录 `{uuid}.meta.json`
- ID 格式：UUID v4，由 `crypto.randomUUID()` 生成

**API 路由：**

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

**权限：**
- 删除接口预留了管理员校验
- 当前硬编码 `isAdmin = true`，后续接入用户系统后替换

### 6. 导航结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | |
| `/resume/new` | 新建简历 | 支持 `?template=xxx` 参数 |
| `/resume/[id]` | 简历预览 | |
| `/resume/[id]/edit` | 编辑简历 | |
| `/analyze` | 简历分析 | AI 分析评分 |
| `/templates` | 模版管理 | 上传/预览/删除模版 |

---

## 编辑器架构（核心）

详细设计见 `EDITOR-DESIGN.md`。这里只列 Agent 需要知道的关键点。

### 两层编辑模型

**Layer 1 — 模版页（逐块原位编辑）：**
- pdfjs-dist 客户端提取 PDF 文字块 → `RichTextBlock[]`（含坐标、字号、颜色）
- 右侧列表逐块 `<textarea>` 编辑，支持删除（导出时涂白不写字）
- 导出时坐标原样传给 fill API，pdf-lib 在相同位置覆盖文字

**Layer 2 — 自定义页（自由排版）：**
- 用户点击「+ 添加页面」→ 复制模版第一页作为底版（保留边框/线条/装饰）
- 底版上所有文字块涂白 → 用 TipTap 富文本编辑器自由编辑
- 导出时 HTML 解析为 TextLine（标题/列表/正文），从文字区域下方开始排版

### 坐标系统（重要！）

```
text-extractor.ts 提取 → PDF 原生坐标（y=0 在底部，往上递增）
fill API 接收        → 同上，不要做二次翻转
fill API 自定义页    → 从上到下排版，y 递减，触底自动分页
```

**常见 Bug：** fill API 中做 `pdfY = pageHeight - e.y - e.h` 是错的——因为 `e.y` 已经是 PDF 原生坐标，翻转会导致文字跑到底部。

### PDF 填充管线（fill/route.ts）

```
1. 加载模版 PDF + 嵌入 CJK 字体 (NotoSansSC-Regular.otf)
2. Part A — 模版页文字替换：
   Pass 1: 画所有白色矩形（覆盖原文，含 descender 余量）
   Pass 2: 画所有新文字（在所有遮罩之上）
3. Part B — 自定义页：
   - copyPages() 复制模版第一页
   - 涂白所有文字块
   - htmlToTextLines() 解析 HTML → TextLine[]
   - 从文字区域下方逐行渲染，超出自动续页
4. 输出 public/filled/{id}.pdf
```

**为什么两遍渲染：** 先画所有遮罩再画所有文字，避免后面的遮罩盖住前面的文字。

### 状态管理

所有编辑器状态集中在 `src/stores/editor-store.ts`（Zustand）：

- `templateId` / `pdfUrl` — 模版标识
- `markdown` / `mdModules` / `editedModules` — MinerU 管线（预留）
- `customPages: CustomPage[]` — 自定义页
- `resumeData` / `resumeId` / `saving` — 持久化
- 切换模版时自动重置所有状态

### 字体依赖

- PDF 填充需要 **`public/NotoSansSC-Regular.otf`**（16MB CJK 字体），缺失则 fill API 500
- 字体已通过 jsDelivr CDN 下载到位，部署时需确认文件存在

---

## 架构决策

### D1 vs 本地文件

- **用户数据和简历内容** → D1 数据库（applications、resumes 表）
- **模版文件** → 本地文件系统 `public/uploads/templates/`
- 原因：D1 不适合存储大文件，PDF 作为静态资源更高效

### 开发环境

- **`pnpm dev`** 而非 `wrangler dev`
  - `wrangler dev` 会尝试连接 Cloudflare 远程代理，本机因无有效 token 会失败
  - `pnpm dev` 仅启动 Next.js，API 路由中 `runtime = "nodejs"` 正常生效
  - D1 本地数据库由 wrangler 后台自动管理

### AI 调用

- 封装在 `src/lib/ai/index.ts`
- 基于 OpenAI 兼容 SDK，支持 DeepSeek / 通义千问 等
- 通过 `.env.local` 切换 `OPENAI_BASE_URL` 和 `AI_MODEL`

### pdf-lib vs Canvas 截图

选择 pdf-lib 原位替换而非 Canvas 截图：
- pdf-lib 输出真 PDF，文字可选、可搜索、矢量无损
- 代价：需要嵌入 16MB CJK 字体，坐标计算需注意 PDF bottom-left 坐标系

---

## 关键文件索引

```
src/
├── app/
│   ├── page.tsx                        # 首页
│   ├── layout.tsx                      # 根布局
│   ├── resume/
│   │   └── new/
│   │       ├── page.tsx                # 新建简历页
│   │       └── ResumeNewContent.tsx    # 编辑器主组件（页签切换、导出逻辑）
│   ├── templates/page.tsx              # 模版管理页
│   ├── analyze/page.tsx                # 简历分析页
│   ├── ai-test/page.tsx                # AI 润色测试页
│   └── api/
│       ├── templates/
│       │   ├── route.ts                # GET 列表
│       │   ├── upload/route.ts         # POST 上传
│       │   └── [id]/
│       │       ├── route.ts            # GET 预览 + DELETE 删除
│       │       ├── fill/route.ts       # POST PDF 填充输出（核心）
│       │       ├── extract-markdown/
│       │       │   └── route.ts        # GET MinerU 提取
│       │       ├── analyze/route.ts    # POST AI 分析
│       │       └── summary/route.ts    # POST AI 摘要
│       ├── ai/
│       │   ├── analyze-resume/route.ts
│       │   ├── improve-resume/route.ts
│       │   ├── improve/route.ts
│       │   └── parse-resume/route.ts
│       └── resume/
│           ├── route.ts                # POST 创建 + GET 列表
│           └── [id]/route.ts           # GET/PUT/DELETE 单个简历
├── components/
│   ├── ui/                             # shadcn/ui 组件库
│   ├── editor/
│   │   ├── RichTextEditor.tsx          # TipTap 富文本编辑器（自定义页用）
│   │   ├── MarkdownEditor.tsx          # 纯文本 Markdown 编辑器（预留）
│   │   ├── FullEditor.tsx              # 结构化表单编辑器
│   │   ├── SectionEditor.tsx           # 按模块分区的编辑器
│   │   ├── ModuleList.tsx              # 模块列表（预留 MinerU 管线）
│   │   ├── UploadZone.tsx              # 文件拖拽上传区
│   │   ├── milkdown.css                # Milkdown/ProseMirror 样式（预留）
│   │   └── extensions/                 # TipTap 自定义扩展
│   │       ├── FontSize.ts
│   │       └── TextIndent.ts
│   ├── preview/
│   │   ├── ClickablePdfView.tsx        # 可点击的 PDF 预览（react-pdf）
│   │   ├── PdfPageView.tsx             # 多页 PDF 预览
│   │   ├── index.tsx                   # HTML 预览面板
│   │   ├── page-break-line.tsx         # 分页线指示器
│   │   ├── use-auto-one-page.ts        # 自动单页缩放 hook
│   │   └── use-content-height.ts       # 内容高度监听 hook
│   ├── resume/
│   │   ├── BasicInfoStep.tsx           # 基本信息表单
│   │   ├── EducationStep.tsx
│   │   ├── ExperienceStep.tsx
│   │   ├── ProjectStep.tsx
│   │   ├── SkillsStep.tsx
│   │   ├── WorkStep.tsx
│   │   ├── StepIndicator.tsx
│   │   └── TemplateClassic.tsx
│   └── templates/
│       ├── classic/                    # 经典模版
│       │   ├── config.ts
│       │   └── index.tsx
│       ├── types.ts
│       ├── registry.ts                 # 模版注册表
│       └── index.tsx
├── hooks/
│   ├── use-auth.ts                     # 认证 hook
│   └── use-resume-form.ts             # 简历表单 hook
├── stores/
│   └── editor-store.ts                # 编辑器全局状态（Zustand）
├── lib/
│   ├── ai/index.ts                     # AI SDK 封装
│   ├── auth/                           # Authing OIDC 认证
│   │   ├── index.ts
│   │   ├── oidc.ts
│   │   └── types.ts
│   ├── db/
│   │   ├── schema.ts                   # Drizzle ORM Schema
│   │   └── index.ts                    # DB 连接（D1 / SQLite fallback）
│   ├── pdf/
│   │   ├── text-extractor.ts           # pdfjs-dist 文字块提取
│   │   ├── mineru-extractor.ts         # MinerU 客户端封装（预留）
│   │   ├── image-extractor.ts          # PDF 图片提取
│   │   ├── module-detector.ts          # 模块检测（预留 MinerU 管线）
│   │   └── page-renderer.ts            # Canvas 页面渲染
│   ├── editor/
│   │   └── html-parser.ts              # PDF 字体/颜色映射
│   ├── api/
│   │   ├── resume.ts                   # 简历 CRUD API 客户端
│   │   └── templates.ts                # 模版 API 客户端
│   ├── validators/
│   │   └── resume.schema.ts            # 简历数据 Zod Schema
│   ├── extract.ts                      # 内容提取入口
│   └── utils.ts                        # 通用工具
└── types/
    └── mineru-open-sdk.d.ts            # MinerU SDK 类型声明
```

## 常见问题

**Q: `pnpm dev` 报 Cloudflare API 错误？**
A: 不影响使用。那是 wrangler 后台尝试连 Cloudflare 远程代理，本地不需要。忽略即可。

**Q: 上传 PDF 后预览不了？**
A: 确认 `pnpm dev` 而非 `wrangler dev`。API 路由用 302 重定向到 `/uploads/templates/{id}.pdf`。

**Q: PDF 填充报 "请先下载 CJK 字体"？**
A: 执行 `curl -L -o public/NotoSansSC-Regular.otf https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`

**Q: 文字替换后位置偏移？**
A: 检查 fill API 是否做了 `pageHeight - y` 翻转——text-extractor 传过来的 y 已经是 PDF 原生坐标，不需要再翻转。

**Q: 如何新增一个 UI 组件？**
A: `pnpm dlx shadcn@latest add <component-name>`，然后用 `@/components/ui` 导入。

**Q: 如何切换 AI 模型？**
A: 修改 `.env.local` 中的 `OPENAI_BASE_URL` 和 `AI_MODEL`。

**Q: 删除模版接口提示 403？**
A: 检查 `src/app/api/templates/[id]/route.ts` 中 DELETE 方法的内置模版保护逻辑。
