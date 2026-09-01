"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Activity,
  AlertTriangle,
  Clock,
  Users,
  Search,
  RotateCcw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Button } from "@resume/ui";
import { Badge } from "@resume/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@resume/ui";
import { toast } from "sonner";

// ── 类型 ──

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

interface Stats {
  todayRequests: number;
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  activeUsers: number;
  avgResponseTime: number;
  topEndpoints: { path: string; count: number; avgDuration: number }[];
  topUsers: { userId: string; count: number }[];
  requestsOverTime: { date: string; count: number; errors: number }[];
}

// ── 工具函数 ──

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) +
      " " +
      d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function getPageList(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const pages: (number | "...")[] = [1];
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

function methodBadge(method: string) {
  const map: Record<string, string> = {
    GET: "bg-emerald-100 text-emerald-700",
    POST: "bg-blue-100 text-blue-700",
    PATCH: "bg-amber-100 text-amber-700",
    DELETE: "bg-red-100 text-red-700",
    PUT: "bg-purple-100 text-purple-700",
  };
  return map[method] ?? "bg-slate-100 text-slate-600";
}

function statusBadge(code: number) {
  if (code < 300) return "bg-emerald-100 text-emerald-700";
  if (code < 400) return "bg-yellow-100 text-yellow-700";
  if (code < 500) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

function durationColor(ms: number) {
  if (ms < 200) return "text-emerald-600";
  if (ms < 1000) return "text-amber-600";
  return "text-red-600";
}

// ── 页面组件 ──

export default function AdminLogsPage() {
  // Stats
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  // Filters
  const [filterPath, setFilterPath] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterStatusCode, setFilterStatusCode] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Applied filters (only update on search)
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  // Cleanup
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleanupDays, setCleanupDays] = useState("7");
  const [cleaningUp, setCleaningUp] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Jump-to-page input
  const [jumpValue, setJumpValue] = useState("");

  const pageSize = 50;

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/logs/stats");
      if (res.ok) setStats(await res.json() as Stats);
    } catch { /* silent */ }
    setStatsLoading(false);
  }, []);

  // ── Fetch logs ──
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      Object.entries(appliedFilters).forEach(([k, v]) => { if (v) params.set(k, v); });

      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { logs: LogEntry[]; total: number; totalPages: number };
      setLogs(data.logs ?? []);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error("获取日志列表失败");
    }
    setLogsLoading(false);
  }, [page, appliedFilters]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Search：应用筛选条件 ──
  const handleSearch = () => {
    const filters: Record<string, string> = {};
    if (filterPath) filters.path = filterPath;
    if (filterMethod) filters.method = filterMethod;
    if (filterStatusCode) filters.statusCode = filterStatusCode;
    if (filterUserId) filters.userId = filterUserId;
    if (filterStartDate) filters.startDate = filterStartDate;
    if (filterEndDate) filters.endDate = filterEndDate;
    setPage(1);
    setAppliedFilters(filters);
  };

  // ── Reset filters ──
  const handleReset = () => {
    setFilterPath("");
    setFilterMethod("");
    setFilterStatusCode("");
    setFilterUserId("");
    setFilterStartDate("");
    setFilterEndDate("");
    setPage(1);
    setAppliedFilters({});
  };

  // ── Jump to page ──
  const handleJump = () => {
    const n = parseInt(jumpValue, 10);
    if (!Number.isFinite(n)) return;
    setPage(Math.max(1, Math.min(totalPages || 1, n)));
    setJumpValue("");
  };

  // ── Cleanup ──
  const handleCleanup = async () => {
    setCleaningUp(true);
    try {
      const res = await fetch(`/api/admin/logs?days=${cleanupDays}`, { method: "DELETE" });
      const data = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        toast.success(data.message ?? "清理完成");
        setShowCleanup(false);
        fetchLogs();
        fetchStats();
      } else {
        toast.error(data.error ?? "清理失败");
      }
    } catch {
      toast.error("清理失败");
    }
    setCleaningUp(false);
  };

  // ── Render ──
  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">请求监控</h1>
          <p className="mt-1 text-sm text-slate-500">API 请求日志与统计</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchStats(); }}>
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => setShowCleanup(true)}
          >
            <Trash2 className="size-4 mr-1" />清理日志
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-slate-300" />
          </div>
        ) : stats ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <Activity className="size-3.5" />今日请求数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold text-slate-900">{stats.todayRequests}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <XCircle className="size-3.5" />错误率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className={`text-2xl font-bold ${stats.errorRate > 5 ? "text-red-600" : "text-slate-900"}`}>
                  {stats.errorRate}%
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <Users className="size-3.5" />活跃用户（7天）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold text-slate-900">{stats.activeUsers}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <Clock className="size-3.5" />平均响应（7天）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold text-slate-900">{stats.avgResponseTime}ms</span>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="col-span-full text-center py-8 text-sm text-slate-400">暂无统计数据</div>
        )}
      </div>

      {/* Filter Bar */}
      <Card className="mb-6">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">开始日期</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-36"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">结束日期</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-36"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">方法</label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-24"
              >
                <option value="">全部</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">状态码</label>
              <select
                value={filterStatusCode}
                onChange={(e) => setFilterStatusCode(e.target.value)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-24"
              >
                <option value="">全部</option>
                <option value="200">2xx</option>
                <option value="400">4xx</option>
                <option value="500">5xx</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs text-slate-400">路径</label>
              <input
                type="text"
                value={filterPath}
                onChange={(e) => setFilterPath(e.target.value)}
                placeholder="/api/chat"
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-full"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs text-slate-400">用户 ID</label>
              <input
                type="text"
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                placeholder="uuid"
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-full"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={handleSearch}>
                <Search className="size-4 mr-1" />搜索
              </Button>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <RotateCcw className="size-4 mr-1" />重置
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-5 animate-spin text-slate-300" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Activity className="size-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium">暂无日志</p>
              <p className="text-xs mt-1">API 请求将自动记录到这里</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="py-3 px-3 text-xs font-medium text-slate-400">时间</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400">方法</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400">路径</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400 w-16">状态</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400 w-16">耗时</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400 hidden md:table-cell">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {logs.map((log) => (
                      <Fragment key={log.id}>
                        <tr
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(log.timestamp)}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge className={`text-xs font-mono ${methodBadge(log.method)}`}>
                              {log.method}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-sm text-slate-700 font-mono max-w-[300px] truncate">
                            {log.path}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge className={`text-xs ${statusBadge(log.statusCode)}`}>
                              {log.statusCode}
                            </Badge>
                          </td>
                          <td className={`py-2.5 px-3 text-xs font-mono ${durationColor(log.durationMs)}`}>
                            {log.durationMs}ms
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-400 font-mono hidden md:table-cell">
                            {log.ip}
                          </td>
                        </tr>
                        {/* 展开详情 */}
                        {expandedId === log.id && (
                          <tr key={`${log.id}-detail`}>
                            <td colSpan={6} className="bg-slate-50/80 px-6 py-3">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <span className="text-slate-400">Query:</span>{" "}
                                  <span className="text-slate-600 font-mono">{log.queryParams || "-"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">User:</span>{" "}
                                  <span className="text-slate-600 font-mono">{log.userId ?? "匿名"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">UA:</span>{" "}
                                  <span className="text-slate-600">{log.userAgent?.slice(0, 80) || "-"}</span>
                                </div>
                                {log.errorMessage && (
                                  <div className="md:col-span-3">
                                    <span className="text-red-500">Error:</span>{" "}
                                    <span className="text-red-600 font-mono">{log.errorMessage}</span>
                                  </div>
                                )}
                                {log.requestBody && (
                                  <div className="md:col-span-3">
                                    <div className="text-slate-400 mb-1">请求体（参数）:</div>
                                    <pre className="whitespace-pre-wrap break-all bg-white border border-slate-200 rounded-md p-2 font-mono text-slate-700 max-h-40 overflow-auto">
                                      {log.requestBody}
                                    </pre>
                                  </div>
                                )}
                                {log.responseBody && (
                                  <div className="md:col-span-3">
                                    <div className="text-slate-400 mb-1">返回内容:</div>
                                    <pre className="whitespace-pre-wrap break-all bg-white border border-slate-200 rounded-md p-2 font-mono text-slate-700 max-h-40 overflow-auto">
                                      {log.responseBody}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
                <span className="text-sm text-slate-500">共 {total} 条</span>

                <div className="flex items-center gap-1 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(1)}
                    title="首页"
                  >
                    <ChevronsLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    title="上一页"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>

                  {getPageList(page, totalPages || 1).map((p, i) =>
                    p === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-slate-400">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="sm"
                        className="min-w-9 px-2"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ),
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    title="下一页"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(totalPages)}
                    title="末页"
                  >
                    <ChevronsRight className="size-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <span>第 {page}/{totalPages || 1} 页</span>
                  <span className="text-slate-300">|</span>
                  <span>跳至</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages || 1}
                    value={jumpValue}
                    onChange={(e) => setJumpValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleJump(); }}
                    placeholder={String(page)}
                    className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm"
                  />
                  <span>页</span>
                  <Button size="sm" variant="outline" onClick={handleJump}>跳转</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 清理确认弹窗 */}
      <Dialog open={showCleanup} onOpenChange={(v) => { if (!v) setShowCleanup(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-500" />
              清理旧日志
            </DialogTitle>
            <DialogDescription>
              将删除指定天数之前的所有请求日志，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 py-2">
            <label className="text-sm text-slate-600 whitespace-nowrap">清理</label>
            <input
              type="number"
              min="1"
              value={cleanupDays}
              onChange={(e) => setCleanupDays(e.target.value)}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-20"
            />
            <label className="text-sm text-slate-600 whitespace-nowrap">天前的日志</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCleanup(false)} disabled={cleaningUp}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleCleanup} disabled={cleaningUp}>
              {cleaningUp ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              确认清理
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
