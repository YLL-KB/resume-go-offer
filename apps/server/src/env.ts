import { existsSync } from "node:fs";
import path from "node:path";

// tsx 启动的 server 进程不会像 Next.js 那样自动加载 .env / .env.local，
// 这里手动对齐 Next 的约定：先 .env 后 .env.local，后加载的覆盖先加载的。
for (const file of [".env", ".env.local"]) {
  const target = path.resolve(process.cwd(), file);
  if (existsSync(target)) {
    process.loadEnvFile(target);
  }
}
