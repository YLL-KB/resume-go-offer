# 部署与运维指南

## 部署目标

生产环境部署在自建 VPS 上，不再使用 Cloudflare Workers。

| 项 | 值 |
|---|---|
| 服务器 | `root@47.116.46.77` |
| 部署目录 | `/opt/resume-go-offer` |
| 进程管理 | PM2（进程名 `resume`） |
| 域名 | `https://www.resumeoffer.cn` |
| 部署脚本 | `./deploy.sh`（即 `pnpm deploy:vps`） |

## 部署流程

一键部署：

```bash
./deploy.sh
```

脚本逻辑：

1. 优先 `git push origin <当前分支>`，成功后服务器端 `git pull`；
2. GitHub 不可达（国内 TLS 干扰）时自动回退：本地 `tar` 打包 → `scp` 上传 → 服务器解压；
3. 服务器端统一执行：`pnpm install --frozen-lockfile` → `NODE_ENV=production next build` → `pm2 restart resume`。

> 脚本通过 `--exclude` 排除了 `.git` / `node_modules` / `.next` / `.db` / `.env.local` 等目录，
> **绝不会覆盖服务器上的 `.db/` 数据库文件和 `.env.local` 配置**。

### 首次部署

```bash
# 1. 服务器上创建目录并 clone 仓库（或 scp 源码上去）
ssh root@47.116.46.77
mkdir -p /opt/resume-go-offer && cd /opt/resume-go-offer
git clone <repo-url> .

# 2. 安装依赖 + 配置环境变量 + 下载 CJK 字体
pnpm install
cp .env.example .env.local   # 填入真实值
curl -L -o public/NotoSansSC-Regular.otf \
  https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf

# 3. 构建 + 用 pm2 启动
NODE_ENV=production npx next build
pm2 start npx --name resume -- next start -p 3000
pm2 save
```

### 日常更新

本机跑 `./deploy.sh` 即可，脚本会完成 push/pull、依赖安装、构建、重启全流程。

## 环境变量

生产环境变量配置在服务器 `/opt/resume-go-offer/.env.local`（本机 `.env.local` 不会随部署覆盖）。以下为完整变量清单，对齐 `.env.example`：

| 变量 | 必须 | 说明 | 默认值 |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✅ | 应用公开访问地址 | `http://localhost:3000` |
| `OPENAI_API_KEY` | ✅ | AI 大模型接口 Key | - |
| `OPENAI_BASE_URL` | - | AI 接口地址 | `https://api.openai.com/v1` |
| `AI_MODEL` | - | Worker 高质量模型（advising/extracting） | `gpt-4o-mini` |
| `ROUTER_MODEL` | - | Router 快速分类模型 | `glm-4-flash` |
| `LANGGRAPH_ENABLED` | - | 启用 LangGraph Agent 模式 | - |
| `AI_EXTRACT_API_KEY` / `AI_EXTRACT_BASE_URL` / `AI_EXTRACT_MODEL` | - | 简历提取用更快的模型，未设则复用 OpenAI | 复用 `OPENAI_*` |
| `AI_VISION_MODEL` | - | 视觉模型（岗位截图解析） | - |
| `ZHIPU_API_KEY` | - | 智谱 API（图片解析） | - |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | - | GitHub OAuth 登录 | - |
| `AUTHING_ISSUER` / `AUTHING_APP_ID` / `AUTHING_APP_SECRET` | - | Authing OIDC 登录 | - |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | - | 微信开放平台登录 | - |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | - | Sentry 错误监控 | - |
| `MINERU_TOKEN` | - | MinerU 高精度 PDF 解析，未设则用 Flash 模式 | 无（Flash 模式） |
| `LANGCHAIN_API_KEY` / `LANGCHAIN_TRACING_V2` | - | LangSmith 调试追踪 | - |

## 运行环境要求

### 1. Node.js 运行时（必需）

大量 API 路由使用 Node.js `fs` 模块，**不支持纯 Edge 运行时**。需要 Node.js 的 API 路由顶部均声明了 `export const runtime = "nodejs"`。

### 2. CJK 字体文件（必需）

PDF 填充功能需要中文字体，确保服务器上存在：

```
public/NotoSansSC-Regular.otf
```

下载命令：

```bash
curl -L -o public/NotoSansSC-Regular.otf \
  https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
```

不加此字体，PDF 填充接口会返回 500 错误。

### 3. pdfjs-dist Worker

确保 `public/pdf.worker.mjs` 文件存在。Next.js 构建时通常会自动处理。

### 4. 文件系统写入权限

以下目录/文件需要在运行时可写：

| 路径 | 用途 |
|---|---|
| `public/uploads/templates/` | 上传的 PDF 模版 + 元数据 |
| `public/filled/` | 填充后的 PDF 输出 |
| `.db/local.db` | 本地 SQLite 数据库 |

## 数据库说明

- **生产（VPS）**：本地 SQLite（`better-sqlite3`），数据文件在 `.db/local.db`。启动时通过 `src/lib/db/index.ts` 里的 `MIGRATIONS` 数组自动建表，**无需手动执行 migration**。
- **开发（本机）**：同样是 SQLite 自动建表；若走 Cloudflare 上下文则回退到 D1（`getDb()` 内部自动判断）。

> 旧文档中「`npx wrangler d1 execute ... --local`」的初始化方式已废弃，数据库表结构现在由代码内 `MIGRATIONS` 数组维护，随启动自动同步。

## 常用运维命令

```bash
# 查看日志
ssh root@47.116.46.77 "pm2 logs resume --lines 100"

# 重启 / 停止
ssh root@47.116.46.77 "pm2 restart resume"
ssh root@47.116.46.77 "pm2 stop resume"

# 查看进程状态
ssh root@47.116.46.77 "pm2 status"
```

## 备份

数据库文件 `.db/local.db`（WAL 模式，同目录有 `local.db-wal` / `local.db-shm`）是核心数据。备份时需一并拷贝整个 `.db/` 目录：

```bash
tar -czf db-backup-$(date +%s).tar.gz .db/
```

---

在线编辑器的架构设计详见 [EDITOR-DESIGN.md](./EDITOR-DESIGN.md)。
