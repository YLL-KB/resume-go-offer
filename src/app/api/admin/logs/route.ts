/**
 * GET /api/admin/logs — 分页查询请求日志
 * DELETE /api/admin/logs — 清理 N 天前的日志
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestLogs } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/auth/admin";
import { and, gte, lte, desc, like, eq } from "drizzle-orm";
import { withRequestLog } from "@/lib/logging/request-logger";

export const GET = withRequestLog(async (request: NextRequest) => {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  try {
    const db = getDb();
    const sp = request.nextUrl.searchParams;

    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(Math.max(1, parseInt(sp.get("pageSize") ?? "50", 10)), 200);

    const pathFilter = sp.get("path") ?? undefined;
    const methodFilter = sp.get("method") ?? undefined;
    const statusCodeFilter = sp.get("statusCode") ? parseInt(sp.get("statusCode")!, 10) : undefined;
    const userIdFilter = sp.get("userId") ?? undefined;
    const startDate = sp.get("startDate") ?? undefined;
    const endDate = sp.get("endDate") ?? undefined;

    const conditions = [];
    if (pathFilter) conditions.push(like(requestLogs.path, `%${pathFilter}%`));
    if (methodFilter) conditions.push(eq(requestLogs.method, methodFilter.toUpperCase()));
    if (statusCodeFilter !== undefined) conditions.push(eq(requestLogs.statusCode, statusCodeFilter));
    if (userIdFilter) conditions.push(eq(requestLogs.userId, userIdFilter));
    if (startDate) conditions.push(gte(requestLogs.timestamp, startDate));
    if (endDate) conditions.push(lte(requestLogs.timestamp, endDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const allRows = await db
      .select()
      .from(requestLogs)
      .where(where)
      .orderBy(desc(requestLogs.timestamp))
      .all();

    const total = allRows.length;
    const offset = (page - 1) * pageSize;
    const rows = allRows.slice(offset, offset + pageSize);

    return NextResponse.json({ logs: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error("[admin/logs]", err);
    return NextResponse.json({ error: "获取日志列表失败" }, { status: 500 });
  }
});

export const DELETE = withRequestLog(async (request: NextRequest) => {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  try {
    const db = getDb();
    const days = Math.max(1, parseInt(request.nextUrl.searchParams.get("days") ?? "7", 10));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const oldLogs = await db
      .select()
      .from(requestLogs)
      .where(lte(requestLogs.timestamp, cutoff))
      .all();

    const deleted = oldLogs.length;

    if (deleted > 0) {
      await db.delete(requestLogs).where(lte(requestLogs.timestamp, cutoff)).run();
    }

    return NextResponse.json({ ok: true, deleted, message: `已清理 ${deleted} 条 ${days} 天前的日志` });
  } catch (err) {
    console.error("[admin/logs] cleanup error:", err);
    return NextResponse.json({ error: "清理日志失败" }, { status: 500 });
  }
});
