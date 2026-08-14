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
  requestBody: string | null;
  responseBody: string | null;
  userId: string | null;
  ip: string;
  statusCode: number;
  durationMs: number;
  errorMessage: string | null;
  userAgent: string;
  timestamp: string;
}

// 请求/响应体截断上限，防止超大 body（文件上传、大 JSON）撑爆 SQLite
const MAX_BODY_CHARS = 16_000;

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
  requestBody: string | null,
  responseBody: string | null,
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
    requestBody,
    responseBody,
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
 * 读取请求体（参数）。必须在 handler 消费 body 之前 clone，否则读取失败。
 * 跳过无 body 的方法与二进制/文件上传。
 */
async function readRequestBody(req: Request): Promise<string | null> {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") return null;
  const ct = req.headers.get("content-type") ?? "";
  if (!/json|text|form|urlencoded/i.test(ct)) return null;
  try {
    const text = await req.clone().text();
    return text ? text.slice(0, MAX_BODY_CHARS) : null;
  } catch {
    return null;
  }
}

/**
 * 读取响应体（返回内容）。跳过 SSE 流式响应（chat 接口，内容已由 trace 记录）
 * 与无 body 的状态码。
 */
async function readResponseBody(res: Response): Promise<string | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (/text\/event-stream/.test(ct)) return null;
  if (res.status === 204 || res.status === 304) return null;
  try {
    const text = await res.clone().text();
    return text ? text.slice(0, MAX_BODY_CHARS) : null;
  } catch {
    return null;
  }
}

/**
 * Hono 请求日志中间件：记录每个请求的元数据 + 参数 + 返回内容，写入失败不影响业务。
 */
export const requestLogger = createMiddleware(async (c, next) => {
  const start = performance.now();
  let statusCode = 500;
  let errorMessage: string | null = null;

  // 在 next() 之前先 clone 读取请求体，避免 handler 消费 body 后无法再读
  const requestBodyPromise = readRequestBody(c.req.raw);

  try {
    await next();
    statusCode = c.res.status;
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
    throw err;
  } finally {
    const durationMs = Math.round(performance.now() - start);
    const responseBodyPromise = readResponseBody(c.res);
    Promise.all([requestBodyPromise, responseBodyPromise])
      .then(([requestBody, responseBody]) =>
        buildLogEntry(c.req.raw, statusCode, durationMs, errorMessage, requestBody, responseBody),
      )
      .then(flushLog)
      .catch(() => {});
  }
});
