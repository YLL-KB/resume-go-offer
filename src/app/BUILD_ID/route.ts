import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

// 返回 Next.js 构建 ID，供 sw.js 动态生成缓存版本号。
export async function GET() {
  try {
    const buildId = readFileSync(join(/* turbopackIgnore: true */ process.cwd(), ".next", "BUILD_ID"), "utf-8").trim();
    return new Response(buildId, {
      headers: { "Cache-Control": "no-cache", "Content-Type": "text/plain" },
    });
  } catch {
    return new Response("v1", {
      headers: { "Cache-Control": "no-cache", "Content-Type": "text/plain" },
    });
  }
}
