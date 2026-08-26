"use client";

/**
 * 用量面板 — 用户端「我的用量」（不进管理页）
 *
 * 显示近 30 天 token 用量：平台流量（含成本估算，当前只统计不收费）
 * 与 BYOK 流量（用户自己的 Key，平台零成本）分开展示。
 */

import { useEffect, useState, useCallback } from "react";
import { Gauge, Loader2, RefreshCw, Server, KeyRound } from "lucide-react";
import { Button } from "@resume/ui";
import { Badge } from "@resume/ui";
import { toast } from "sonner";

interface UsageDetail {
  days: number;
  platform: { inputTokens: number; outputTokens: number; costCents: number; calls: number };
  byok: { inputTokens: number; outputTokens: number; costCents: number; calls: number };
  bySource: Array<{ source: string; provider: string; inputTokens: number; outputTokens: number; calls: number }>;
  byModel: Array<{ model: string; provider: string; inputTokens: number; outputTokens: number; costCents: number; calls: number }>;
}

const SOURCE_LABELS: Record<string, string> = {
  chat: "对话",
  router: "意图分类",
  extract: "简历提取",
  "extract-core": "简历提取",
  "extract-experience": "简历提取",
  "extract-projects": "简历提取",
  improve: "文案润色",
  analyze: "简历分析",
  summary: "摘要生成",
  parse: "简历解析",
  attachment: "附件解析",
  embedding: "知识检索",
  title: "标题生成",
  "byok-test": "连接测试",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function UsagePanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UsageDetail | null>(null);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/usage?days=30");
      if (!res.ok) throw new Error("HTTP " + res.status);
      setData((await res.json()) as UsageDetail);
    } catch {
      toast.error("获取用量失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const platformTokens = (data?.platform.inputTokens ?? 0) + (data?.platform.outputTokens ?? 0);
  const byokTokens = (data?.byok.inputTokens ?? 0) + (data?.byok.outputTokens ?? 0);

  return (
    <section className="rounded-2xl border border-gray-200/60 bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Gauge className="size-4 text-emerald-600" />我的用量（近 {data?.days ?? 30} 天）
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            AI 功能消耗的 token 统计。当前阶段只记账不收费；使用你自己的 API Key 产生的流量由你的供应商计费。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsage} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RefreshCw className="size-3.5 mr-1" />}
          刷新
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Server className="size-3.5" />平台模型
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatTokens(platformTokens)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                估算成本 ¥{((data?.platform.costCents ?? 0) / 100).toFixed(2)} · {data?.platform.calls ?? 0} 次
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                <KeyRound className="size-3.5" />我的 Key
              </div>
              <p className="mt-1 text-xl font-bold text-emerald-800">{formatTokens(byokTokens)}</p>
              <p className="mt-0.5 text-xs text-emerald-700/80">
                平台零成本 · {data?.byok.calls ?? 0} 次
              </p>
            </div>
          </div>

          {(data?.byModel.length ?? 0) > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-400">按模型（哪个 API 花了多少 token）</p>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-1.5 text-xs font-medium text-slate-400">
                  <span>模型</span>
                  <span className="text-right">tokens</span>
                  <span className="text-right">调用</span>
                  <span className="text-right">估算成本</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {data!.byModel.map((m) => (
                    <div
                      key={`${m.provider}-${m.model}`}
                      className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] items-center gap-3 bg-white px-4 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">{m.model}</span>
                          <Badge variant={m.provider === "byok" ? "default" : "secondary"} className="shrink-0">
                            {m.provider === "byok" ? "自有Key" : "平台"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          输入 {formatTokens(m.inputTokens)} · 输出 {formatTokens(m.outputTokens)}
                        </p>
                      </div>
                      <span className="text-right text-sm font-semibold text-slate-800">
                        {formatTokens(m.inputTokens + m.outputTokens)}
                      </span>
                      <span className="text-right text-sm text-slate-500">{m.calls}</span>
                      <span className="text-right text-sm text-slate-500">
                        {m.provider !== "byok" ? `≈¥${(m.costCents / 100).toFixed(2)}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {(data?.bySource.length ?? 0) > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-400">按功能分布</p>
              <div className="flex flex-wrap gap-1.5">
                {data!.bySource.map((s) => (
                  <Badge key={`${s.provider}-${s.source}`} variant="secondary">
                    {SOURCE_LABELS[s.source] ?? s.source} · {formatTokens(s.inputTokens + s.outputTokens)}
                    {s.provider === "byok" ? " · 自有Key" : ""}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">近 30 天还没有 AI 用量记录</p>
          )}
        </div>
      )}
    </section>
  );
}
