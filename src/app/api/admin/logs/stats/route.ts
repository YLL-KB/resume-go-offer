/**
 * GET /api/admin/logs/stats — 请求统计聚合
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestLogs } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/auth/admin";
import { and, gte, lte } from "drizzle-orm";
import { withRequestLog } from "@/lib/logging/request-logger";

export const GET = withRequestLog(async (request: NextRequest) => {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  try {
    const db = getDb();
    const sp = request.nextUrl.searchParams;

    const endDate = sp.get("endDate") ?? new Date().toISOString();
    const startDate =
      sp.get("startDate") ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

    const dateRange = and(
      gte(requestLogs.timestamp, startDate),
      lte(requestLogs.timestamp, endDate),
    );
    const todayRange = and(
      gte(requestLogs.timestamp, todayStart),
      lte(requestLogs.timestamp, todayEnd),
    );

    const [todayLogs, rangeLogs] = await Promise.all([
      db.select().from(requestLogs).where(todayRange).all(),
      db.select().from(requestLogs).where(dateRange).all(),
    ]);

    // JS 聚合
    const todayRequests = todayLogs.length;
    const totalRequests = rangeLogs.length;
    const errorCount = rangeLogs.filter((l) => l.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? Math.round((errorCount / totalRequests) * 100 * 100) / 100 : 0;

    const userIds = new Set(rangeLogs.filter((l) => l.userId).map((l) => l.userId));
    const activeUsers = userIds.size;

    const totalDuration = rangeLogs.reduce((sum, l) => sum + l.durationMs, 0);
    const avgResponseTime = totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0;

    // Top endpoints
    const endpointMap = new Map<string, { count: number; totalDuration: number }>();
    for (const l of rangeLogs) {
      const entry = endpointMap.get(l.path) ?? { count: 0, totalDuration: 0 };
      entry.count++;
      entry.totalDuration += l.durationMs;
      endpointMap.set(l.path, entry);
    }
    const topEndpoints = [...endpointMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([path, v]) => ({ path, count: v.count, avgDuration: Math.round(v.totalDuration / v.count) }));

    // Top users
    const userMap = new Map<string, number>();
    for (const l of rangeLogs) {
      if (!l.userId) continue;
      userMap.set(l.userId, (userMap.get(l.userId) ?? 0) + 1);
    }
    const topUsers = [...userMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    // Requests over time (by day)
    const dayMap = new Map<string, { count: number; errors: number }>();
    for (const l of rangeLogs) {
      const day = l.timestamp.substring(0, 10);
      const entry = dayMap.get(day) ?? { count: 0, errors: 0 };
      entry.count++;
      if (l.statusCode >= 400) entry.errors++;
      dayMap.set(day, entry);
    }
    const requestsOverTime = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));

    return NextResponse.json({
      todayRequests,
      totalRequests,
      errorCount,
      errorRate,
      activeUsers,
      avgResponseTime,
      topEndpoints,
      topUsers,
      requestsOverTime,
    });
  } catch (err) {
    console.error("[admin/logs/stats]", err);
    return NextResponse.json({ error: "获取统计数据失败" }, { status: 500 });
  }
});
