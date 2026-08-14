/**
 * API 请求日志中间件 — fire-and-forget 请求元数据记录
 *
 * 挂载到 Hono 路由后，自动记录 method/path/query/用户/IP/状态码/耗时/错误
 * 到 request_logs 表。日志写入是异步且不阻塞响应的，写入失败静默忽略。
 */

import { createMiddleware } from "hono/factory";
import { getDb } from "../../db";
import { requestLogs } from "../../db/schema";
import { getAuthUserId } from "../auth/utils";

interface LogEntry {
  id: string;
  method: string;
  path: string;
  queryParams: string;
  userId: string | null;
  ip: string;
  statusCode: number;
  durationMs: number;
  errorMessage: string | null;
  userAgent: string;
  timestamp: string;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  return "unknown";
}

async function flushLog(entry: LogEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(requestLogs).values(entry);
  } catch {
    // 日志写入失败不影响业务
  }
}

async function buildLogEntry(
  req: Request,
  statusCode: number,
  durationMs: number,
  errorMessage: string | null,
): Promise<LogEntry> {
  let userId: string | null = null;
  try {
    const auth = await getAuthUserId(req);
    if (!auth.isAnonymous) userId = auth.userId;
  } catch {
    // 鉴权失败也不影响日志记录
  }

  const url = new URL(req.url);

  return {
    id: crypto.randomUUID(),
    method: req.method,
    path: url.pathname,
    queryParams: url.searchParams.toString(),
    userId,
    ip: getClientIp(req),
    statusCode,
    durationMs,
    errorMessage,
    userAgent: req.headers.get("user-agent") ?? "",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Hono 请求日志中间件：记录每个请求的元数据，写入失败不影响业务。
 */
export const requestLogger = createMiddleware(async (c, next) => {
  const start = performance.now();
  let statusCode = 500;
  let errorMessage: string | null = null;

  try {
    await next();
    statusCode = c.res.status;
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
    throw err;
  } finally {
    const durationMs = Math.round(performance.now() - start);
    buildLogEntry(c.req.raw, statusCode, durationMs, errorMessage)
      .then(flushLog)
      .catch(() => {});
  }
});
