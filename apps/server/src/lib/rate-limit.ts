/**
 * 简易滑动窗口速率限制
 *
 * 本地开发使用内存 Map；生产环境建议用 Cloudflare WAF Rate Limiting
 * 或 D1 计数器替代，因为 Workers 是无状态的。
 */

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

// 定期清理过期条目（每 60s）
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

/**
 * 检查请求是否超过速率限制
 * @returns { allowed: boolean, retryAfter?: number }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000,
): { allowed: boolean; retryAfter?: number } {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { timestamps: [now] });
    return { allowed: true };
  }

  // 移除窗口外的记录
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length < maxRequests) {
    entry.timestamps.push(now);
    return { allowed: true };
  }

  const oldest = entry.timestamps[0];
  const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
  return { allowed: false, retryAfter };
}

/**
 * 为 API 路由生成限流 key
 */
export function getRateLimitKey(request: Request): string {
  // 优先用 IP + 路由前缀作为 key
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const url = new URL(request.url);
  return `${ip}:${url.pathname}`;
}
