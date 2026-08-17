"use client";

/**
 * Token 用量卡片 — 显示近 30 天 AI 用量（记账阶段，只读报表）
 */

import { useEffect, useState, useCallback } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@resume/ui";

interface UsageData {
  days: number;
  total: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    calls: number;
    byModel: Array<{ model: string; inputTokens: number; outputTokens: number; costCents: number; calls: number }>;
    byProvider: Array<{ provider: string; inputTokens: number; outputTokens: number; costCents: number; calls: number }>;
  };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function UsageCard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState(false);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage");
      if (!res.ok) throw new Error("HTTP " + res.status);
      setData((await res.json()) as UsageData);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const total = data?.total;
  const byok = total?.byProvider.find((p) => p.provider === "byok");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
          <Cpu className="size-4" />Token 用量（近 {data?.days ?? 30} 天）
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          error ? (
            <p className="text-sm text-slate-400">用量数据获取失败</p>
          ) : (
            <Loader2 className="size-4 animate-spin text-slate-300" />
          )
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div>
                <span className="text-2xl font-bold text-slate-900">
                  {formatTokens((total?.inputTokens ?? 0) + (total?.outputTokens ?? 0))}
                </span>
                <span className="ml-1 text-xs text-slate-400">tokens</span>
              </div>
              <div className="text-sm text-slate-500">
                估算成本 <span className="font-semibold text-slate-800">¥{((total?.costCents ?? 0) / 100).toFixed(2)}</span>
                <span className="ml-1 text-xs text-slate-400">（价格快照，仅供参考）</span>
              </div>
              <div className="text-sm text-slate-500">
                调用 <span className="font-semibold text-slate-800">{total?.calls ?? 0}</span> 次
              </div>
              {byok && byok.calls > 0 ? (
                <Badge variant="outline">BYOK 流量 {byok.calls} 次（平台零成本）</Badge>
              ) : null}
            </div>
            {(data.total.byModel.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.total.byModel.map((m) => (
                  <Badge key={m.model} variant="secondary">
                    {m.model} · {formatTokens(m.inputTokens + m.outputTokens)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
