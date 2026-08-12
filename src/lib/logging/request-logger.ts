/**
 * API 请求日志工具 — fire-and-forget 请求元数据记录
 *
 * 每个 API route handler 用 withRequestLog 包装后，
 * 自动记录 method/path/query/用户/IP/状态码/耗时/错误 到 request_logs 表。
 *
 * 日志写入是异步且不阻塞响应的，写入失败静默忽略。
 */

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { requestLogs } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/utils";

// ── 内部类型 ──

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

// ── 提取客户端 IP ──

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  return "unknown";
}

// ── Fire-and-forget 写入 DB ──

async function flushLog(entry: LogEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(requestLogs).values(entry);
  } catch {
    // 日志写入失败不影响业务
  }
}

// ── 组装日志条目 ──

async function buildLogEntry(
  req: NextRequest,
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

  return {
    id: crypto.randomUUID(),
    method: req.method,
    path: req.nextUrl.pathname,
    queryParams: req.nextUrl.searchParams.toString(),
    userId,
    ip: getClientIp(req),
    statusCode,
    durationMs,
    errorMessage,
    userAgent: req.headers.get("user-agent") ?? "",
    timestamp: new Date().toISOString(),
  };
}

// ── 公开 API：包装 route handler ──

/**
 * 包装 Next.js API route handler，自动记录请求日志。
 *
 * @example
 *   export const GET = withRequestLog(async (request) => { ... });
 *   export const DELETE = withRequestLog(async (request, { params }) => { ... });
 */
export function withRequestLog<Args extends unknown[]>(
  handler: (req: NextRequest, ...args: Args) => Promise<Response>,
): (req: NextRequest, ...args: Args) => Promise<Response> {
  return async (req: NextRequest, ...args: Args) => {
    const start = performance.now();

    try {
      const response = await handler(req, ...args);
      const durationMs = Math.round(performance.now() - start);

      buildLogEntry(req, response.status, durationMs, null)
        .then(flushLog)
        .catch(() => {});

      return response;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);

      buildLogEntry(
        req,
        500,
        durationMs,
        err instanceof Error ? err.message : "Unknown error",
      )
        .then(flushLog)
        .catch(() => {});

      throw err;
    }
  };
}
