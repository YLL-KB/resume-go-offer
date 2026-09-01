"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, MapPin, MonitorSmartphone, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Button } from "@resume/ui";
import { Badge } from "@resume/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@resume/ui";
import { toast } from "sonner";

interface Visitor {
  ip: string;
  visits: number;
  firstSeenAt: string;
  lastSeenAt: string;
  userAgent: string;
}

function classifyDevice(ua: string): "bot" | "mobile" | "desktop" {
  const u = ua.toLowerCase();
  if (/bot|crawler|spider|slurp|bingpreview/i.test(u)) return "bot";
  if (/mobile|android|iphone|ipad|ipod|windows phone/i.test(u)) return "mobile";
  return "desktop";
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) +
      " " +
      d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const DEVICE_LABEL: Record<"bot" | "mobile" | "desktop", string> = {
  bot: "爬虫",
  mobile: "移动端",
  desktop: "桌面端",
};

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/visitors?days=${d}`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as { visitors?: Visitor[]; totalVisits?: number };
      setVisitors(data.visitors ?? []);
      setTotalVisits(data.totalVisits ?? 0);
    } catch {
      toast.error("获取访客来源失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(days); }, [fetchData, days]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">访客来源</h1>
          <p className="mt-1 text-sm text-slate-500">未登录访客的 IP 来源与访问情况</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">近 7 天</SelectItem>
              <SelectItem value="30">近 30 天</SelectItem>
              <SelectItem value="90">近 90 天</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => fetchData(days)} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
            刷新
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <MapPin className="size-4" />访客 IP 数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-slate-900">{visitors.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <MonitorSmartphone className="size-4" />匿名请求总量
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-slate-900">{totalVisits}</span>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-slate-300" />
        </div>
      ) : visitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20">
          <MapPin className="size-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">近 {days} 天暂无访客</p>
          <p className="text-sm text-slate-400 mt-1">访客访问后会按 IP 聚合出现在这里</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="py-3 px-4 text-xs font-medium text-slate-400">IP</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400">设备</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400">访问次数</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 hidden md:table-cell">最近访问</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 hidden lg:table-cell">首次访问</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 hidden xl:table-cell">User-Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visitors.map((v) => {
                  const device = classifyDevice(v.userAgent);
                  return (
                    <tr key={v.ip} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <code className="rounded bg-slate-50 px-1.5 py-0.5 text-sm text-slate-700 border border-slate-200">
                          {v.ip}
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        {device === "bot" ? (
                          <Badge className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
                            <Bot className="size-3 mr-1" />{DEVICE_LABEL[device]}
                          </Badge>
                        ) : device === "mobile" ? (
                          <Badge className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                            {DEVICE_LABEL[device]}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {DEVICE_LABEL[device]}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{v.visits}</Badge>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="text-sm text-slate-600">{formatDate(v.lastSeenAt)}</span>
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <span className="text-sm text-slate-400">{formatDate(v.firstSeenAt)}</span>
                      </td>
                      <td className="py-3 px-4 hidden xl:table-cell">
                        <span className="text-xs text-slate-400 truncate block max-w-xs" title={v.userAgent}>
                          {v.userAgent || "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
