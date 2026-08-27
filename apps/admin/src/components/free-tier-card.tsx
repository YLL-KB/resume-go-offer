"use client";

/**
 * 免费对话额度卡片 — 本月平台 key 对话消耗（source=chat & provider=platform）
 * 区分登录用户 / 匿名访客，标出已达上限者。
 */

import { useEffect, useState, useCallback } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@resume/ui";

interface FreeTierUser {
  userId: string;
  isAnonymous: boolean;
  name: string | null;
  githubLogin: string | null;
  turns: number;
  limit: number;
  reached: boolean;
}

interface FreeTierData {
  limits: { anon: number; loggedIn: number };
  monthStart: string;
  totalTurns: number;
  anonTurns: number;
  loggedInTurns: number;
  anonUsers: number;
  loggedInUsers: number;
  byUser: FreeTierUser[];
}

const label = (u: FreeTierUser) => (u.isAnonymous ? "访客" : (u.name ?? u.githubLogin ?? u.userId));

export function FreeTierCard() {
  const [data, setData] = useState<FreeTierData | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = (await res.json()) as { freeTier?: FreeTierData };
      setData(json.freeTier ?? null);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
          <Zap className="size-4" />免费对话额度（本月）
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          error ? (
            <p className="text-sm text-slate-400">额度数据获取失败</p>
          ) : (
            <Loader2 className="size-4 animate-spin text-slate-300" />
          )
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div>
                <span className="text-2xl font-bold text-slate-900">{data.totalTurns}</span>
                <span className="ml-1 text-xs text-slate-400">次平台对话</span>
              </div>
              <div className="text-sm text-slate-500">
                登录 <span className="font-semibold text-slate-800">{data.loggedInTurns}</span>
                <span className="ml-1 text-xs text-slate-400">次 · {data.loggedInUsers} 人</span>
              </div>
              <div className="text-sm text-slate-500">
                访客 <span className="font-semibold text-slate-800">{data.anonTurns}</span>
                <span className="ml-1 text-xs text-slate-400">次 · {data.anonUsers} 人</span>
              </div>
              <div className="text-xs text-slate-400">
                额度：登录 {data.limits.loggedIn} 次/月 · 访客 {data.limits.anon} 次/月
              </div>
            </div>

            {data.byUser.length === 0 ? (
              <p className="text-sm text-slate-400">本月暂无平台对话消耗</p>
            ) : (
              <div className="space-y-2">
                {data.byUser.slice(0, 15).map((u) => {
                  const pct = Math.min(100, Math.round((u.turns / Math.max(1, u.limit)) * 100));
                  return (
                    <div key={u.userId} className="flex items-center gap-3">
                      <div className="w-32 shrink-0 truncate text-sm text-slate-700" title={u.userId}>
                        {label(u)}
                      </div>
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            u.reached ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-20 shrink-0 text-right text-xs text-slate-500">
                        {u.turns}/{u.limit} 次
                      </div>
                      {u.reached ? (
                        <Badge className="text-[10px] bg-red-50 text-red-600 border border-red-200">已超限</Badge>
                      ) : (
                        <span className="w-14 shrink-0" />
                      )}
                    </div>
                  );
                })}
                {data.byUser.length > 15 ? (
                  <p className="text-xs text-slate-400">… 共 {data.byUser.length} 个用户有消耗，仅显示前 15</p>
                ) : null}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
