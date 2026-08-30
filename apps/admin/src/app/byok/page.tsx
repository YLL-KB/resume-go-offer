"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Key, Plug, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Button } from "@resume/ui";
import { Badge } from "@resume/ui";
import { Avatar, AvatarImage, AvatarFallback } from "@resume/ui";
import { toast } from "sonner";

interface ApiRow {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  scopes: string[];
  isActive: boolean;
  maskedKey: string;
  lastTestAt: string | null;
  lastTestOk: number | null;
  createdAt: string;
}

interface ByokUser {
  userId: string;
  name: string | null;
  githubLogin: string | null;
  email: string | null;
  isAnonymous: boolean;
  apis: ApiRow[];
}

const SCOPE_LABELS: Record<string, string> = {
  chat: "对话",
  extract: "提取",
  vision: "识别",
};

function userLabel(u: ByokUser): string {
  if (u.isAnonymous) return "访客";
  return u.name ?? u.githubLogin ?? u.email ?? u.userId;
}

function formatDate(iso: string | null): string {
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

export default function ByokPage() {
  const [users, setUsers] = useState<ByokUser[]>([]);
  const [totalApis, setTotalApis] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/byok");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as { users?: ByokUser[]; totalApis?: number };
      setUsers(data.users ?? []);
      setTotalApis(data.totalApis ?? 0);
    } catch {
      toast.error("获取自带 API 列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">自带 API</h1>
          <p className="mt-1 text-sm text-slate-500">查看哪些用户配置了自带 API（BYOK）</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
          刷新
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Plug className="size-4" />配置了自带 API 的用户
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-slate-900">{users.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Key className="size-4" />API 总条数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-slate-900">{totalApis}</span>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-slate-300" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20">
          <Key className="size-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">暂无用户配置自带 API</p>
          <p className="text-sm text-slate-400 mt-1">用户在前台「API 配置」里添加后会出现在这里</p>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((u) => (
            <Card key={u.userId}>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={undefined} />
                    <AvatarFallback className="text-sm bg-emerald-100 text-emerald-700">
                      {userLabel(u).charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-900">{userLabel(u)}</span>
                    <span className="text-xs text-slate-400">
                      {u.githubLogin ? `@${u.githubLogin}` : ""}
                      {u.email ? (u.githubLogin ? " · " : "") + u.email : ""}
                      {!u.githubLogin && !u.email ? u.userId : ""}
                    </span>
                  </div>
                  <Badge variant="secondary" className="ml-auto">{u.apis.length} 条</Badge>
                </div>

                <div className="space-y-3">
                  {u.apis.map((api) => (
                    <div
                      key={api.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {api.name || "未命名"}
                        </span>
                        {api.scopes.map((s) => (
                          <Badge key={s} className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200">
                            {SCOPE_LABELS[s] ?? s}
                          </Badge>
                        ))}
                        {api.isActive ? (
                          <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">启用</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">停用</Badge>
                        )}
                        <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                          {api.lastTestAt == null ? (
                            <>
                              <CircleDashed className="size-3.5 text-slate-300" />未测试
                            </>
                          ) : api.lastTestOk === 1 ? (
                            <>
                              <CheckCircle2 className="size-3.5 text-emerald-500" />测试通过
                            </>
                          ) : (
                            <>
                              <XCircle className="size-3.5 text-red-500" />测试失败
                            </>
                          )}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span>
                          <span className="text-slate-400">模型</span> {api.model}
                        </span>
                        <span className="truncate max-w-md" title={api.baseUrl}>
                          <span className="text-slate-400">BaseURL</span> {api.baseUrl}
                        </span>
                        <span>
                          <span className="text-slate-400">Key</span>{" "}
                          <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-600 border border-slate-200">
                            {api.maskedKey}
                          </code>
                        </span>
                        <span className="ml-auto text-slate-400">创建 {formatDate(api.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
