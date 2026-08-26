#!/usr/bin/env bash
set -euo pipefail

# ── VPS 部署脚本（pnpm Monorepo）───────────────────────────
# 用法: ./deploy.sh
# 要求: 本机已配置 SSH key 登录 root@47.116.46.77
#
# 优先尝试 git push/pull，失败则回退到 SCP 打包传输。
# 重要：绝不会覆盖服务器上的 .db/ 数据库文件和 .env.local 配置。
#
# 部署对象（3 个 PM2 进程，见 ecosystem.config.cjs）：
#   resume-server  apps/server  (Hono, :8787)
#   resume-web     apps/web     (Next, :3000)
#   resume-admin   apps/admin   (Next, :3001)

SERVER="root@47.116.46.77"
REMOTE_DIR="/opt/resume-go-offer"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# ── 需要传输的源文件（排除危险/本地目录）──
# 注意：不再排除 .git —— SCP 回退时连同 git 仓库一起同步，
# 使服务器 HEAD 与本地一致、工作区干净，避免下次 git pull 冲突。
EXCLUDES=(
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
  --exclude='._*'
)

echo "🚀 部署分支 \`${BRANCH}\` 到 ${SERVER}..."

# ── 服务器端构建 + 重启命令（同步完成后统一执行）──
read -r -d '' REMOTE_STEPS << 'ENDSSH' || true
echo "  ↻ pnpm install..."
pnpm install --frozen-lockfile
echo "  ↻ build web + admin..."
pnpm --filter @resume/web build
pnpm --filter @resume/admin build
echo "  ↻ pm2 startOrReload..."
pm2 startOrReload ecosystem.config.cjs
pm2 save
echo "  ✓ 部署完成"
ENDSSH

# ── 1. 尝试推送到 GitHub ──
PUSHED=false
if git push origin "${BRANCH}" 2>/dev/null; then
  PUSHED=true
  echo "✅ Git push 成功"
else
  echo "⚠️  Git push 失败（GitHub 不可达），改用 SCP 传输"
fi

# ── 2. 同步代码到服务器（git pull 优先，失败回退 SCP）──
SYNCED=false
if $PUSHED; then
  echo "📦 服务器尝试 git pull..."
  if ssh "${SERVER}" "cd ${REMOTE_DIR} && git pull origin \$(git rev-parse --abbrev-ref HEAD)"; then
    echo "✅ 服务器 git pull 成功"
    SYNCED=true
  else
    echo "⚠️  服务器 git pull 失败（GitHub 不可达），回退 SCP 传输"
  fi
fi

if ! $SYNCED; then
  echo "  ↻ 打包源文件..."
  TARFILE="/tmp/resume-deploy-$(date +%s).tar.gz"
  tar -czf "${TARFILE}" "${EXCLUDES[@]}" .
  echo "  ↻ 上传到服务器..."
  scp -q "${TARFILE}" "${SERVER}:/tmp/deploy.tar.gz"
  rm -f "${TARFILE}"

  ssh "${SERVER}" << ENDSSH
set -euo pipefail
cd ${REMOTE_DIR}
echo "  ↻ 解压源码 + 同步 git（保留 .db）..."
tar -xzf /tmp/deploy.tar.gz --overwrite --exclude='.db' 2>/dev/null || tar -xzf /tmp/deploy.tar.gz --overwrite
rm -f /tmp/deploy.tar.gz
git reset --hard HEAD 2>/dev/null || true
git clean -fd 2>/dev/null || true
echo "  ↻ git HEAD: \$(git log --oneline -1)"
ENDSSH
fi

# ── 3. 服务器构建 + 重启 ──
echo "📦 服务器构建中..."
ssh "${SERVER}" << ENDSSH
set -euo pipefail
cd ${REMOTE_DIR}
${REMOTE_STEPS}
ENDSSH

echo ""
echo "✅ 已部署到 https://www.resumeoffer.cn"
