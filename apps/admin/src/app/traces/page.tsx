"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  Workflow,
  AlertTriangle,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Button } from "@resume/ui";
import { Badge } from "@resume/ui";

// ── 类型 ──

interface TraceRow {
  id: string;
  conversationId: string;
  userId: string | null;
  mode: string | null;
  model: string | null;
  input: string;
  output: string | null;
  totalTokens: number;
  durationMs: number;
  status: "success" | "degraded" | "error";
  errorMessage: string | null;
  timestamp: string;
}

interface DegradationStats {
  total: number;
  byName: { name: string; count: number }[];
  overTime: { date: string; count: number }[];
}

// ── 工具函数 ──

const DEGRADATION_LABELS: Record<string, string> = {
  router_json_fallback: "Router JSON 兜底",
  illegal_mode: "非法 mode",
  iteration_limit: "迭代超限",
  knowledge_init_failed: "知识库初始化失败",
  extract_null: "简历提取为空",
  suggest_fallback: "润色失败兜底",
  knowledge_empty: "知识库为空",
  knowledge_no_result: "知识库无结果",
  extract_json_retry: "提取 JSON 重试",
  regex_fallback: "正则兜底",
  llm_timeout: "LLM 超时",
};

const MODE_LABELS: Record<string, string> = {
  chatting: "闲聊",
  collecting: "收集信息",
  advising: "优化建议",
  extracting: "提取简历",
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) +
      " " +
      d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    );
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  if (status === "success") return "bg-emerald-100 text-emerald-700";
  if (status === "degraded") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function statusLabel(status: string) {
  if (status === "success") return "成功";
  if (status === "degraded") return "降级";
  return "错误";
}

function durationColor(ms: number) {
  if (ms < 3000) return "text-emerald-600";
  if (ms < 10000) return "text-amber-600";
  return "text-red-600";
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

// ── 页面组件 ──

export default function AdminTracesPage() {
  const [stats, setStats] = useState<DegradationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterConversationId, setFilterConversationId] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const [jumpValue, setJumpValue] = useState("");

  const pageSize = 50;

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/degradations/stats");
      if (res.ok) setStats((await res.json()) as DegradationStats);
    } catch {
      /* silent */
    }
    setStatsLoading(false);
  }, []);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      Object.entries(appliedFilters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const res = await fetch(`/api/admin/traces?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { traces: TraceRow[]; total: number; totalPages: number };
      setTraces(data.traces ?? []);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, [page, appliedFilters]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);
  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  const handleSearch = () => {
    const filters: Record<string, string> = {};
    if (filterStatus) filters.status = filterStatus;
    if (filterConversationId) filters.conversationId = filterConversationId;
    if (filterStartDate) filters.startDate = filterStartDate;
    if (filterEndDate) filters.endDate = filterEndDate;
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilterStatus("");
    setFilterConversationId("");
    setFilterStartDate("");
    setFilterEndDate("");
    setPage(1);
    setAppliedFilters({});
  };

  const handleJump = () => {
    const n = parseInt(jumpValue, 10);
    if (!Number.isFinite(n)) return;
    setPage(Math.max(1, Math.min(totalPages || 1, n)));
    setJumpValue("");
  };

  const maxDailyDegradations = stats?.overTime.reduce((m, d) => Math.max(m, d.count), 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Traces</h1>
          <p className="mt-1 text-sm text-slate-500">单次 AI 请求的可回放快照与降级监控</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchTraces();
            fetchStats();
          }}
        >
          刷新
        </Button>
      </div>

      {/* 降级概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />降级事件（7天）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-900">{statsLoading ? "…" : stats?.total ?? 0}</span>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Workflow className="size-3.5" />降级类型分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-slate-300" />
              </div>
            ) : !stats || stats.byName.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">暂无降级事件</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.byName.map((d) => (
                  <Badge
                    key={d.name}
                    className="text-xs bg-amber-50 text-amber-700 border border-amber-200"
                  >
                    {DEGRADATION_LABELS[d.name] ?? d.name} × {d.count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 降级趋势 */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Clock className="size-3.5" />降级趋势（按天）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-slate-300" />
            </div>
          ) : !stats || stats.overTime.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">暂无降级趋势数据</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {stats.overTime.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-xs text-slate-500">{d.count > 0 ? d.count : ""}</span>
                  <div
                    className="w-full rounded-t bg-amber-400/80 hover:bg-amber-500 transition-colors"
                    style={{
                      height: `${maxDailyDegradations > 0 ? Math.max(4, (d.count / maxDailyDegradations) * 100) : 4}px`,
                    }}
                    title={`${d.date}: ${d.count} 次`}
                  />
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 筛选 */}
      <Card className="mb-6">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">状态</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm w-28"
              >
                <option value="">全部</option>
                <option value="success">成功</option>
                <option value="degraded">降级</option>
                <option value="error">错误</option>
              </select>
            </div>
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
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-xs text-slate-400">会话 ID</label>
              <input
                type="text"
                value={filterConversationId}
                onChange={(e) => setFilterConversationId(e.target.value)}
                placeholder="conversationId"
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

      {/* Trace 列表 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-5 animate-spin text-slate-300" />
            </div>
          ) : traces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Workflow className="size-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium">暂无 trace</p>
              <p className="text-xs mt-1">AI 对话请求会自动记录到这里</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="py-3 px-3 text-xs font-medium text-slate-400">时间</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400">会话</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400">模式</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400">模型</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400 w-16">状态</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400 w-16">耗时</th>
                      <th className="py-3 px-3 text-xs font-medium text-slate-400 w-16">Token</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {traces.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(t.timestamp)}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-500 font-mono max-w-[200px] truncate">
                          {t.conversationId}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">
                          {t.mode ? MODE_LABELS[t.mode] ?? t.mode : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 font-mono">{t.model ?? "-"}</td>
                        <td className="py-2.5 px-3">
                          <Badge className={`text-xs ${statusBadge(t.status)}`}>
                            {statusLabel(t.status)}
                          </Badge>
                        </td>
                        <td className={`py-2.5 px-3 text-xs font-mono ${durationColor(t.durationMs)}`}>
                          {(t.durationMs / 1000).toFixed(1)}s
                        </td>
                        <td className="py-2.5 px-3 text-xs font-mono text-slate-500">{t.totalTokens}</td>
                        <td className="py-2.5 px-3 text-right">
                          <Link
                            href={`/traces/${t.id}`}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1"
                          >
                            <Zap className="size-3" />回放
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 ? (
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
              ) : (
                <div className="px-4 py-3 border-t border-slate-100 text-sm text-slate-500">共 {total} 条</div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
