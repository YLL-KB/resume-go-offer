#!/usr/bin/env bash
set -euo pipefail

# ── VPS 部署脚本 ──────────────────────────────────────────
# 用法: ./deploy.sh
# 要求: 本机已配置 SSH key 登录 root@47.116.46.77

SERVER="root@47.116.46.77"
REMOTE_DIR="/opt/resume-go-offer"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "🚀 部署分支 \`${BRANCH}\` 到 ${SERVER}..."

# 1. 推送本地提交到远程
echo "📦 推送到 GitHub..."
git push origin "${BRANCH}"

# 2. 服务器端：拉取 → 安装依赖 → 构建 → 重启
echo "🔧 服务器更新中..."
ssh "${SERVER}" << 'ENDSSH'
set -euo pipefail
cd /opt/resume-go-offer

echo "  ↻ git pull..."
git pull origin $(git rev-parse --abbrev-ref HEAD)

echo "  ↻ pnpm install..."
pnpm install --frozen-lockfile

echo "  ↻ next build..."
NODE_ENV=production npx next build

echo "  ↻ pm2 restart..."
pm2 restart resume

echo "  ✓ 部署完成"
ENDSSH

echo ""
echo "✅ 已部署到 https://www.resumeoffer.cn"
