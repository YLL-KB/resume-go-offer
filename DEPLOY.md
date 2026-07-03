# 部署与运维指南

## 系统架构

```
用户浏览器                        服务端 (Node.js)
    │                                │
    ├─ 上传 PDF 模版 ──────────────► public/uploads/templates/
    │                                │
    ├─ 解析模版 (pdfjs-dist) ◄──── 客户端本地执行
    │                                │
    ├─ 编辑文字块 ◄─────────────── 客户端状态
    │                                │
    ├─ 生成预览 ──────────────────► POST /api/templates/[id]/fill
    │                                │  ├─ pdf-lib 加载模版 PDF
    │                                │  ├─ 嵌入 CJK 字体
    │                                │  ├─ 白色矩形覆盖原文
    │                                │  ├─ 画新文字
    │                                │  ├─ 自定义页：复制模版页 → 涂白 → 渲染内容
    │                                │  └─ 输出 → public/filled/{id}.pdf
    │                                │
    └─ 下载 PDF ◄────────────────── 返回 /filled/{id}.pdf
```

## 环境变量

部署前需要在服务器或 Cloudflare Dashboard 中配置以下变量：

| 变量 | 必须 | 说明 | 默认值 |
|---|---|---|---|
| `AUTHING_APP_ID` | ✅ | Authing OIDC 应用 ID | - |
| `AUTHING_APP_SECRET` | ✅ | Authing OIDC 应用密钥 | - |
| `AUTHING_ISSUER` | ✅ | Authing 租户 URL | - |
| `NEXT_PUBLIC_APP_URL` | ✅ | 应用公开访问地址 | `http://localhost:3000` |
| `OPENAI_API_KEY` | ✅ | AI 润色/分析接口 Key | - |
| `OPENAI_BASE_URL` | - | AI 接口地址 | `https://api.openai.com/v1` |
| `AI_MODEL` | - | AI 模型名 | `deepseek-chat` |
| `MINERU_TOKEN` | - | MinerU API Token（有则启用 bbox 提取） | 无（使用 Flash 模式） |
| `LANGCHAIN_TRACING_V2` | - | LangSmith 调试追踪 | - |
| `LANGCHAIN_API_KEY` | - | LangSmith API Key | - |

## 运行环境要求

### 1. Node.js 运行时（必需）

本项目大量 API 路由使用 Node.js `fs` 模块进行文件读写，**不支持纯 Edge 运行时**。

所有标记 `runtime = "nodejs"` 的路由：
- `src/app/api/templates/upload/route.ts` — 上传模版
- `src/app/api/templates/[id]/fill/route.ts` — PDF 填充输出
- `src/app/api/templates/[id]/analyze/route.ts` — AI 分析
- `src/app/api/templates/[id]/summary/route.ts` — AI 摘要
- `src/app/api/templates/[id]/extract-markdown/route.ts` — MinerU 提取
- `src/app/api/templates/route.ts` — 模版列表
- `src/app/api/templates/[id]/route.ts` — 单个模版

### 2. CJK 字体文件（必需）

PDF 填充功能需要中文字体。部署后确保服务器上存在：

```
public/NotoSansSC-Regular.otf
```

下载命令：
```bash
curl -L -o public/NotoSansSC-Regular.otf \
  https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
```

不加此字体，PDF 填充接口会返回 500 错误。

### 3. pdfjs-dist Worker（必需）

确保 `public/pdf.worker.mjs` 文件存在。Next.js 构建时通常会自动处理。

### 4. 文件系统写入权限

以下目录需要在运行时可写：

| 目录 | 用途 |
|---|---|
| `public/uploads/templates/` | 上传的 PDF 模版 + 元数据 |
| `public/filled/` | 填充后的 PDF 输出 |
| `.db/` | 本地 SQLite 数据库（开发环境） |

### 5. Cloudflare 部署（生产环境）

本项目使用 OpenNext + Cloudflare Workers 部署：

```bash
# 构建
pnpm build
opennextjs-cloudflow build

# 部署
pnpm deploy   # 等同于 opennextjs-cloudflow build && opennextjs-cloudflow deploy
```

需要预先创建 Cloudflare 资源：
- **D1 数据库**：`resume-go-offer-db`（绑定名 `DB`）
- **KV 命名空间**：`RESUME_GO_OFFER_KV`（绑定名 `RESUME_GO_OFFER_KV`）

`wrangler.jsonc` 中配置绑定关系。本地开发时使用 `better-sqlite3` 替代 D1。

---

## 在线编辑功能说明

整个编辑管线分为 **模版页** 和 **自定义页** 两种模式。

### 模版页编辑（第1页）

```
上传 PDF 模版
    │
    ▼
┌──────────────────────────────────┐
│ pdfjs-dist 提取文字块             │
│ 每个文字块 = {x, y, w, h, text,  │
│              fontSize, color}    │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│ 右侧文字块列表                     │
│ ┌────────────────────────┐      │
│ │ #0 · p1 · 36px    [🗑] │      │
│ │ ┌──────────────────┐   │      │
│ │ │ 詹密简历          │   │      │
│ │ └──────────────────┘   │      │
│ ├────────────────────────┤      │
│ │ #1 · p1 · 14px    [🗑] │      │
│ │ ┌──────────────────┐   │      │
│ │ │ 前端工程师         │   │      │
│ │ └──────────────────┘   │      │
│ └────────────────────────┘      │
└──────────────────────────────────┘
    │
    ▼ 点击「生成预览」
┌──────────────────────────────────┐
│ POST /api/templates/[id]/fill    │
│ ┌─ 白色矩形覆盖原文               │
│ └─ 画新文字在相同位置             │
│ → 输出 public/filled/{id}.pdf    │
└──────────────────────────────────┘
```

**关键行为**：
- 每个文字块可独立编辑或删除
- 删除的块 → 导出时只涂白不写文字（即"抹掉"）
- 文字替换在原位置、原字号、原颜色进行

### 自定义页编辑（第2页及以上）

```
点击「+ 添加页面」
    │
    ▼
┌──────────────────────────────────┐
│ RichTextEditor (TipTap 富文本)    │
│ ┌──────────────────────────────┐ │
│ │ [B] [I] [U] [H1] [H2] [•]   │ │  工具栏
│ ├──────────────────────────────┤ │
│ │                              │ │
│ │ ## 项目经验                   │ │
│ │                              │ │
│ │ • 负责XX系统架构设计           │ │
│ │ • 带领5人团队完成YY项目        │ │
│ │                              │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
    │
    ▼ 点击「生成预览」
┌──────────────────────────────────┐
│ POST /api/templates/[id]/fill    │
│                                  │
│ 自定义页处理：                    │
│ ┌─ copyPages() 复制模版第一页     │
│ │   (保留边框/线条/装饰)          │
│ ├─ 涂白全部原始文字块             │
│ ├─ 解析 HTML → 标题/列表/正文     │
│ ├─ 从文字区域下方开始排版         │
│ └─ 内容超出 → 自动追加续页        │
│ → 合并输出单份 PDF                │
└──────────────────────────────────┘
```

**关键行为**：
- 自定义页**继承模版的视觉风格**（边框、线条、图标等装饰元素保留）
- 富文本支持：H1-H3 标题、加粗、斜体、列表、字号、颜色
- 内容超出单页时自动创建续页（续页为纯白 A4）
- 多个自定义页可分别编辑不同内容

### 保存与导出

| 操作 | 接口 | 说明 |
|---|---|---|
| 保存草稿 | `POST /api/resume` / `PUT /api/resume/[id]` | 存入 D1/SQLite，包含 blocks + edits + customPages |
| 生成预览 | `POST /api/templates/[id]/fill` | 服务端 pdf-lib 渲染，输出到 `public/filled/` |
| 下载 PDF | 直接访问 | `window.open("/filled/{id}.pdf")` |

### 数据流图

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ 上传 PDF 模版 │ ──► │ pdfjs-dist   │ ──► │ 文字块列表    │
│ (public/...) │     │ 提取坐标+文字 │     │ (blocks[])   │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                    ┌─────────────────────────────┤
                    ▼                             ▼
           ┌──────────────┐              ┌──────────────┐
           │ 模版页编辑     │              │ 自定义页编辑   │
           │ textarea 逐块 │              │ TipTap 富文本 │
           │ 编辑/删除      │              │ 自由排版       │
           └──────┬───────┘              └──────┬───────┘
                  │                              │
                  └──────────┬───────────────────┘
                             ▼
                    ┌──────────────┐
                    │ 保存草稿       │
                    │ D1 / SQLite   │
                    └──────────────┘
                             │
                             ▼ 点击「生成预览」
                    ┌──────────────┐
                    │ fill API      │
                    │ pdf-lib 渲染  │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ 合并 PDF 输出  │
                    │ /filled/xxx   │
                    └──────────────┘
```
