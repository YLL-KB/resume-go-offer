#!/usr/bin/env bash
set -euo pipefail

# ── VPS 部署脚本 ──────────────────────────────────────────
# 用法: ./deploy.sh
# 要求: 本机已配置 SSH key 登录 root@47.116.46.77
#
# 优先尝试 git push/pull，失败则回退到 SCP 打包传输。
# 重要：绝不会覆盖服务器上的 .db/ 数据库文件。

SERVER="root@47.116.46.77"
REMOTE_DIR="/opt/resume-go-offer"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# ── 需要传输的源文件（排除危险/本地目录）──
EXCLUDES=(
  --exclude='.git'
  --exclude='node_modules'
  --exclude='.next'
  --exclude='.open-next'
  --exclude='.turbo'
  --exclude='.db'
  --exclude='.wrangler'
  --exclude='.claude'
  --exclude='.env.local'
  --exclude='.env'
  --exclude='*.tar.gz'
  --exclude='.DS_Store'
)

echo "🚀 部署分支 \`${BRANCH}\` 到 ${SERVER}..."

# ── 1. 尝试推送到 GitHub ──
PUSHED=false
if git push origin "${BRANCH}" 2>/dev/null; then
  PUSHED=true
  echo "✅ Git push 成功"
else
  echo "⚠️  Git push 失败（GitHub 不可达），改用 SCP 传输"
fi

# ── 2. 服务器端更新 ──
echo "📦 服务器更新中..."

if $PUSHED; then
  # GitHub 可达 → git pull
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
else
  # GitHub 不可达 → SCP 打包
  echo "  ↻ 打包源文件..."
  TARFILE="/tmp/resume-deploy-$(date +%s).tar.gz"
  tar -czf "${TARFILE}" "${EXCLUDES[@]}" .
  echo "  ↻ 上传到服务器..."
  scp -q "${TARFILE}" "${SERVER}:/tmp/deploy.tar.gz"
  rm -f "${TARFILE}"

  ssh "${SERVER}" << 'ENDSSH'
set -euo pipefail
cd /opt/resume-go-offer
echo "  ↻ 解压源码（保留 .db）..."
tar -xzf /tmp/deploy.tar.gz --overwrite --exclude='.db' 2>/dev/null || tar -xzf /tmp/deploy.tar.gz --overwrite
rm -f /tmp/deploy.tar.gz
echo "  ↻ pnpm install..."
pnpm install --frozen-lockfile
echo "  ↻ next build..."
NODE_ENV=production npx next build
echo "  ↻ pm2 restart..."
pm2 restart resume
echo "  ✓ 部署完成"
ENDSSH
fi

echo ""
echo "✅ 已部署到 https://www.resumeoffer.cn"
