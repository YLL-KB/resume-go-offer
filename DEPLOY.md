# 部署与运维指南

## 部署目标

生产环境部署在自建 VPS 上，不再使用 Cloudflare Workers。

| 项 | 值 |
|---|---|
| 服务器 | `root@47.116.46.77` |
| 部署目录 | `/opt/resume-go-offer` |
| 进程管理 | PM2（3 个进程，见 `ecosystem.config.cjs`） |
| 域名 | `https://www.resumeoffer.cn` |
| 部署脚本 | `./deploy.sh`（即 `pnpm deploy:vps`） |

## 部署架构（Monorepo）

项目是 pnpm Monorepo，生产环境跑 **3 个独立进程**，由 Nginx 反代统一对外：

| 进程 | 应用 | 端口 | 说明 |
|------|------|------|------|
| `resume-server` | `apps/server` | 8787 | Hono 后端（全部 API，tsx 运行源码） |
| `resume-web` | `apps/web` | 3000 | Next.js 前端 |
| `resume-admin` | `apps/admin` | 3001 | Next.js 管理后台 |

Nginx 反向代理建议（按路径分流）：

```
www.resumeoffer.cn  /          → 127.0.0.1:3000   (web)
www.resumeoffer.cn  /api/*     → 127.0.0.1:8787   (server)
www.resumeoffer.cn  /admin*    → 127.0.0.1:3001   (admin，如用独立域名/路径)
```

> ⚠️ Nginx 反代 `/api/*` 时必须**不压缩 `text/event-stream`**（关闭 gzip 或排除 SSE），否则 AI 对话会失去逐字流式输出（前端要等响应结束才一次性渲染）。

## 部署流程

一键部署：

```bash
./deploy.sh
```

脚本逻辑：

1. 优先 `git push origin <当前分支>`，成功后服务器端 `git pull`；
2. GitHub 不可达（国内 TLS 干扰）时自动回退：本地 `tar` 打包 → `scp` 上传 → 服务器解压；
3. 服务器端统一执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @resume/web build      # Next 前端构建
pnpm --filter @resume/admin build    # Next 后台构建
pm2 startOrReload ecosystem.config.cjs   # 启动/重载 3 个进程
pm2 save
```

> server（Hono）用 tsx 运行源码，无需构建；`apps/server` 的 `build` 脚本只是 `tsc --noEmit` 类型校验，不进部署链路。
>
> 脚本通过 `--exclude` 排除了 `.git` / `node_modules` / `.next` / `.db` / `.env.local` 等目录，
> **绝不会覆盖服务器上的 `.db/` 数据库文件和 `.env.local` 配置**。

### 首次部署

```bash
# 1. 服务器上创建目录并 clone 仓库（或 scp 源码上去）
ssh root@47.116.46.77
mkdir -p /opt/resume-go-offer && cd /opt/resume-go-offer
git clone <repo-url> .

# 2. 安装依赖 + 配置环境变量
pnpm install
cp .env.example .env.local                              # 后端（apps/server）
# 分别配置 apps/server/.env.local 和 apps/web/.env.local

# 3. 下载 CJK 字体（PDF 导出必需）
curl -L -o apps/server/public/NotoSansSC-Regular.otf \
  https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf

# 4. 构建前端 + 用 pm2 启动
pnpm --filter @resume/web build
pnpm --filter @resume/admin build
pm2 start ecosystem.config.cjs
pm2 save
```

### 日常更新

本机跑 `./deploy.sh` 即可，脚本会完成 push/pull、依赖安装、构建、进程重载全流程。

## 部署注意事项（monorepo 迁移踩坑记录）

以下几条是「旧单体 → monorepo」迁移时踩过的坑，均已修复，留作后续部署排查参考。

### 1. PM2 执行 pnpm bin shim 必须用 /bin/sh

`ecosystem.config.cjs` 里 `script` 指向 `node_modules/.bin/tsx` / `.bin/next`，这些是 pnpm 生成的 **shell 脚本**（`#!/bin/sh`），不是 Node 脚本。PM2 默认用 `node` 解释器执行，会报：

```
SyntaxError: missing ) after argument list
```

因此每个进程都必须显式声明 `interpreter: "/bin/sh"`（`ecosystem.config.cjs` 已配置，勿删）。

### 2. 环境变量需拆分到各 app 目录

旧单体时代 `.env.local` 在仓库根目录；monorepo 拆分后加载位置变了：

- 后端 `apps/server/src/env.ts` 从 `process.cwd()`（即 `apps/server/`）加载 `.env` / `.env.local`
- 前端 Next.js 从各自 app 目录（`apps/web/`）加载

**首次迁移必须把根目录的 `.env.local` 拆分到 `apps/server/.env.local` 和 `apps/web/.env.local`**。否则后端报 `[AI] OPENAI_API_KEY 未配置` 直接启动失败，前端缺 `NEXT_PUBLIC_*`。`deploy.sh` 排除 `.env.local` 不覆盖，所以迁移动作需手动做一次。

### 3. DATABASE_DIR 必须指向持久化目录

`getDb()` 默认用 `process.cwd()/.db`。server 进程的 cwd 是 `apps/server`，不加 `DATABASE_DIR` 时会新建 `apps/server/.db` 空库，**读不到根 `.db/` 里的历史数据**（用户、对话、简历）。

生产须在 `apps/server/.env.local` 里设置：

```
DATABASE_DIR=/opt/resume-go-offer/.db
```

指向旧的持久化库，避免数据「看起来丢了」。

### 4. 表结构是懒加载的（MIGRATIONS 在首次 getDb 时执行）

`apps/server/src/db/index.ts` 的 `MIGRATIONS` 在 `getDb()` **首次被调用时**执行，而不是 server 启动时。所以：

- 部署后新表（如 `ai_traces`）不会立刻出现在 SQLite 里
- 要等第一个真正触发数据库访问的请求（聊天、查日志等）才会建表
- 健康检查 `/health` 不访问数据库，不会触发

判断是否已建表：`sqlite3 <db> '.tables'`。

### 5. 健康检查双路径

`/health`（挂在根）与 `/api/health`（统一 API 前缀）**都可访问**。生产域名经 Nginx 只把 `/api/*` 反代到 server，所以**生产健康检查用 `/api/health`**；`/health` 仅供 server 内网直连（`127.0.0.1:8787/health`）。

### 6. 管理后台通过 /admin 路径访问

admin 是独立 Next 应用，配置了 `basePath: "/admin"`，生产通过 Nginx `location /admin` 反代到 3001（**保留路径、proxy_pass 无尾斜杠**），复用主域名 cookie 登录态。访问地址：**`https://www.resumeoffer.cn/admin`**。

- `apps/admin/next.config.ts` 的 `basePath: "/admin"` 让路由/静态资源带前缀（`/admin/logs`、`/admin/_next/...`）
- `apps/admin/.env.local` 需设 `NEXT_PUBLIC_WEB_URL=https://www.resumeoffer.cn`（未登录跳转登录页用）
- admin 前端 fetch 用绝对路径 `/api/*`，走主域名 `location /` → web rewrites → server，**不经过 admin 自己的 3001**（鉴权 cookie 在主域名下共享）

### 7. 后台权限（角色 + 套餐）

后台鉴权已从单一 `ADMIN_GITHUB_IDS` 白名单升级为「细粒度 RBAC」：

- **超级管理员**：`ADMIN_GITHUB_IDS` 命中者拥有全部权限（`*`），作为 bootstrap 防止锁死，保留不动。
- **数据库角色**：`roles` / `user_roles` 表存后台角色与用户授权，后台「权限管理」页可增删角色、按页面勾选权限点（`admin.users` / `admin.logs` / `admin.traces` / `admin.permissions`）。
- **套餐（收费地基）**：`plans` / `user_plans` 表存套餐与功能项（entitlement），本期未接支付，后续接微信/支付宝时权限层已就绪。
- 四张表随 `MIGRATIONS` 自动建表，并内置种子角色 `super_admin` / `admin` / `viewer` 与套餐 `free`（`INSERT OR IGNORE` 幂等，首次 `getDb()` 时写入）。

## 环境变量

环境变量分两处（各 app 独立加载）：

- **后端** `apps/server/.env.local` — AI 模型、数据库、认证、MinerU 等
- **前端** `apps/web/.env.local` — `NEXT_PUBLIC_*`、Sentry 等

| 变量 | 必须 | 说明 | 默认值 |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✅ | 应用公开访问地址 | `http://localhost:3000` |
| `OPENAI_API_KEY` | ✅ | AI 大模型接口 Key | - |
| `OPENAI_BASE_URL` | - | AI 接口地址 | `https://api.openai.com/v1` |
| `AI_MODEL` | - | Worker 高质量模型（advising/extracting） | `gpt-4o-mini` |
| `ROUTER_MODEL` | - | Router 快速分类模型 | `glm-4-flash` |
| `LANGGRAPH_ENABLED` | - | 启用 LangGraph Agent 模式 | - |
| `PORT` | - | server 监听端口 | `8787` |
| `DATABASE_DIR` | - | SQLite 数据库目录（默认 `apps/server/.db`） | `process.cwd()/.db` |
| `AI_EXTRACT_API_KEY` / `AI_EXTRACT_BASE_URL` / `AI_EXTRACT_MODEL` | - | 简历提取用更快的模型，未设则复用 OpenAI | 复用 `OPENAI_*` |
| `AI_VISION_MODEL` | - | 视觉模型（岗位截图解析） | - |
| `ZHIPU_API_KEY` | - | 智谱 API（图片解析） | - |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | - | GitHub OAuth 登录 | - |
| `AUTHING_ISSUER` / `AUTHING_APP_ID` / `AUTHING_APP_SECRET` | - | Authing OIDC 登录 | - |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | - | 微信开放平台登录 | - |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | - | Sentry 错误监控 | - |
| `MINERU_TOKEN` | - | MinerU 高精度 PDF 解析，未设则用 Flash 模式 | 无（Flash 模式） |
| `LANGCHAIN_API_KEY` | - | LangSmith API Key（开发调试追踪） | - |
| `LANGCHAIN_TRACING_V2` | - | 开启 LangSmith 自动追踪（`true` 启用） | - |
| `LANGCHAIN_PROJECT` | - | LangSmith 项目名（如 `resume-go-offer-dev`） | - |
| `LANGCHAIN_TRACING_SAMPLING_RATE` | - | 生产采样比例 0~1（如 `0.05`=5%，排查样本池用） | 全量 |

## 运行环境要求

### 1. Node.js 运行时（必需）

后端（`apps/server`）和前端（`apps/web`/`apps/admin`）都跑在 Node.js 环境，大量 API 使用 `fs` 模块，**不支持纯 Edge 运行时**。

### 2. CJK 字体文件（必需）

PDF 填充功能需要中文字体，确保服务器上存在：

```
apps/server/public/NotoSansSC-Regular.otf
```

下载命令：

```bash
curl -L -o apps/server/public/NotoSansSC-Regular.otf \
  https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
```

不加此字体，PDF 填充接口会返回 500 错误。

### 3. pdfjs-dist Worker

确保 `apps/server/public/pdf.worker.mjs` 文件存在。服务端 fill 路由通过 `process.cwd()/public/pdf.worker.mjs` 引用它。

### 4. 文件系统写入权限

以下目录/文件需要在运行时可写（均相对 `apps/server/`）：

| 路径 | 用途 |
|---|---|
| `apps/server/public/uploads/templates/` | 上传的 PDF 模版 + 元数据 |
| `apps/server/public/filled/` | 填充后的 PDF 输出 |
| `apps/server/.db/` | 本地 SQLite 数据库 |

## 数据库说明

- **生产（VPS）**：本地 SQLite（`better-sqlite3`），数据文件在 `apps/server/.db/local.db`（由 `DATABASE_DIR` 覆盖）。启动时通过 `apps/server/src/db/index.ts` 里的 `MIGRATIONS` 数组自动建表，**无需手动执行 migration**。
- **开发（本机）**：同样是 SQLite（`better-sqlite3`）自动建表，数据在 `apps/server/.db/local.db`。

> 旧文档中「`npx wrangler d1 execute ... --local`」的初始化方式已废弃，数据库表结构现在由代码内 `MIGRATIONS` 数组维护，随启动自动同步。

## 常用运维命令

```bash
# 查看日志（3 个进程分别看）
ssh root@47.116.46.77 "pm2 logs resume-server --lines 100"
ssh root@47.116.46.77 "pm2 logs resume-web --lines 100"
ssh root@47.116.46.77 "pm2 logs resume-admin --lines 100"

# 重启单个进程
ssh root@47.116.46.77 "pm2 restart resume-server"
ssh root@47.116.46.77 "pm2 restart resume-web"

# 全部重载（部署后）
ssh root@47.116.46.77 "pm2 startOrReload ecosystem.config.cjs"

# 查看进程状态
ssh root@47.116.46.77 "pm2 status"

# 查看实时日志（全部）
ssh root@47.116.46.77 "pm2 logs"
```

## 备份

数据库文件 `apps/server/.db/local.db`（WAL 模式，同目录有 `local.db-wal` / `local.db-shm`）是核心数据。备份时需一并拷贝整个 `.db/` 目录：

```bash
tar -czf db-backup-$(date +%s).tar.gz apps/server/.db/
```

---

在线编辑器的架构设计详见 [TECH-STACK.md](./TECH-STACK.md) 的「PDF 处理」章节。
