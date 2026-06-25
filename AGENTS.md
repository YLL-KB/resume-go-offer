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

### 3. API 路由

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

### 4. 模版系统

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
| POST | `/api/templates/[id]/summary` | AI 提取简历标题和摘要 |

**预览/下载：**
- 预览：API 302 重定向 → `/uploads/templates/{id}.pdf`
- 下载：直接 `<a href="/uploads/templates/{id}.pdf" download>`
- iframe 片段（`#view=FitH`）不会随 302 传递，需在静态 URL 上加

**权限：**
- 删除接口预留了管理员校验
- 当前硬编码 `isAdmin = true`，后续接入用户系统后替换

### 5. 导航结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | |
| `/resume/new` | 新建简历 | 支持 `?template=xxx` 参数 |
| `/resume/[id]` | 简历预览 | |
| `/resume/[id]/edit` | 编辑简历 | |
| `/analyze` | 简历分析 | AI 分析评分 |
| `/templates` | 模版管理 | 上传/预览/删除模版 |

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

## 关键文件索引

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
│   ├── templates/page.tsx          # 模版管理页
│   ├── analyze/page.tsx            # 简历分析页
│   └── api/
│       ├── templates/
│       │   ├── route.ts            # GET 列表
│       │   ├── upload/route.ts     # POST 上传
│       │   └── [id]/
│       │       ├── route.ts        # GET 预览 + DELETE 删除
│       │       └── summary/route.ts # POST AI 摘要
│       └── ai/
│           └── analyze-resume/route.ts
├── components/
│   ├── ui/                         # shadcn/ui 组件库
│   └── resume/                     # 简历相关组件
├── hooks/
│   └── use-resume-form.ts          # 简历表单状态管理
└── lib/
    ├── ai/index.ts                 # AI SDK 封装
    └── validators/                 # Zod 校验
```

## 常见问题

**Q: `pnpm dev` 报 Cloudflare API 错误？**
A: 不影响使用。那是 wrangler 后台尝试连 Cloudflare 远程代理，本地不需要。忽略即可。

**Q: 上传 PDF 后预览不了？**
A: 确认 `pnpm dev` 而非 `wrangler dev`。API 路由用 302 重定向到 `/uploads/templates/{id}.pdf`。

**Q: 如何新增一个 UI 组件？**
A: `pnpm dlx shadcn@latest add <component-name>`，然后用 `@/components/ui` 导入。

**Q: 如何切换 AI 模型？**
A: 修改 `.env.local` 中的 `OPENAI_BASE_URL` 和 `AI_MODEL`。

**Q: 删除模版接口提示 403？**
A: 检查 `src/app/api/templates/[id]/route.ts` 中 DELETE 方法的内置模版保护逻辑。
