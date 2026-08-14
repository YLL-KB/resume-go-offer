// PM2 进程配置 — pnpm Monorepo 三进程部署
// 用法: pm2 startOrReload ecosystem.config.cjs
// 进程名分别对应 apps/ 下三个应用，cwd 为各 app 目录。
module.exports = {
  apps: [
    {
      name: "resume-server",
      cwd: "./apps/server",
      script: "./node_modules/.bin/tsx",
      args: "src/index.ts",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "512M",
    },
    {
      name: "resume-web",
      cwd: "./apps/web",
      script: "./node_modules/.bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "512M",
    },
    {
      name: "resume-admin",
      cwd: "./apps/admin",
      script: "./node_modules/.bin/next",
      args: "start -p 3001",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "512M",
    },
  ],
};
