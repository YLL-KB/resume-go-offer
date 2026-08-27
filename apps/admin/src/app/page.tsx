"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Users,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Button } from "@resume/ui";
import { Badge } from "@resume/ui";
import { Avatar, AvatarImage, AvatarFallback } from "@resume/ui";
import { Label } from "@resume/ui";
import { Checkbox } from "@resume/ui";
import { Input } from "@resume/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@resume/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@resume/ui";
import { toast } from "sonner";
import { UsageCard } from "@/components/usage-card";
import { FreeTierCard } from "@/components/free-tier-card";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
  createdAt: string;
  conversationCount: number;
  roles: string[];
  roleIds: string[];
  plan: string | null;
  planId: string | null;
  isAnonymous: boolean;
  usage30d: { tokens: number; costCents: number; calls: number };
}

interface ConversationRow {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface Role {
  id: string;
  name: string;
  label: string;
  permissions: string[];
  isBuiltin: number;
}

interface Plan {
  id: string;
  name: string;
  label: string;
  features: string[];
  sortOrder: number;
  isActive: number;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const [canGrant, setCanGrant] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [grantTarget, setGrantTarget] = useState<UserRow | null>(null);
  const [grantRoles, setGrantRoles] = useState<string[]>([]);
  const [grantPlan, setGrantPlan] = useState<string>("");
  const [grantExpiresAt, setGrantExpiresAt] = useState<string>("");
  const [grantSaving, setGrantSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("获取失败");
      const data = await res.json() as { users: UserRow[] };
      setUsers(data.users ?? []);
    } catch {
      toast.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    fetch("/api/admin/me")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { permissions?: string[] };
        const perms = data.permissions ?? [];
        const can = perms.includes("*") || perms.includes("admin.permissions");
        setCanGrant(can);
        if (can) {
          const [rolesRes, plansRes] = await Promise.all([
            fetch("/api/admin/permissions/roles"),
            fetch("/api/admin/permissions/plans"),
          ]);
          if (rolesRes.ok) setRoles(((await rolesRes.json()) as { roles: Role[] }).roles ?? []);
          if (plansRes.ok) setPlans(((await plansRes.json()) as { plans: Plan[] }).plans ?? []);
        }
      })
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "删除失败");
      }
      toast.success(`已删除用户 ${deleteTarget.name ?? deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      if (expandedUser === deleteTarget.id) setExpandedUser(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const toggleConversations = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    setLoadingConvs(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/conversations`);
      if (!res.ok) throw new Error("获取失败");
      const data = await res.json() as { conversations: ConversationRow[] };
      setConversations(data.conversations ?? []);
    } catch {
      toast.error("获取对话列表失败");
    } finally {
      setLoadingConvs(false);
    }
  };

  const openGrant = (u: UserRow) => {
    setGrantTarget(u);
    setGrantRoles(u.roleIds ?? []);
    setGrantPlan(u.planId ?? "");
    setGrantExpiresAt("");
  };

  const saveGrant = async () => {
    if (!grantTarget) return;
    setGrantSaving(true);
    try {
      const [rolesRes, planRes] = await Promise.all([
        fetch(`/api/admin/users/${grantTarget.id}/roles`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleIds: grantRoles }),
        }),
        fetch(`/api/admin/users/${grantTarget.id}/plan`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: grantPlan || null, expiresAt: grantExpiresAt || null }),
        }),
      ]);
      if (!rolesRes.ok || !planRes.ok) {
        const body = !rolesRes.ok ? await rolesRes.json().catch(() => null) : await planRes.json().catch(() => null);
        throw new Error((body as { error?: string })?.error ?? "保存失败");
      }
      toast.success("已更新权限");
      setGrantTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setGrantSaving(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  // ── 渲染 ──
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">管理后台</h1>
          <p className="mt-1 text-sm text-slate-500">用户管理</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
          刷新
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Users className="size-4" />总用户数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-slate-900">{users.length}</span>
          </CardContent>
        </Card>
        <UsageCard />
      </div>

      {/* 免费额度消耗 */}
      <div className="mb-6">
        <FreeTierCard />
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-slate-300" />
        </div>
      ) : users.length === 0 ? (
        /* Empty */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20">
          <Users className="size-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">暂无用户</p>
          <p className="text-sm text-slate-400 mt-1">用户注册后会出现在这里</p>
        </div>
      ) : (
        /* User Table */
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="py-3 px-4 text-xs font-medium text-slate-400">用户</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 hidden sm:table-cell">GitHub</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 hidden md:table-cell">邮箱</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400">对话</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400">30天用量</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 hidden lg:table-cell">注册时间</th>
                  <th className="py-3 px-4 text-xs font-medium text-slate-400 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <>
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarImage src={u.avatarUrl ?? undefined} />
                            <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                              {(u.name ?? "U").charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-900">
                              {u.name ?? "匿名用户"}
                            </span>
                            {(u.roles.length > 0 || u.plan) && (
                              <div className="flex flex-wrap items-center gap-1">
                                {u.roles.map((r) => (
                                  <Badge key={r} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {r}
                                  </Badge>
                                ))}
                                {u.plan && (
                                  <Badge className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200">
                                    {u.plan}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <span className="text-sm text-slate-500">{u.githubLogin ?? "-"}</span>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="text-sm text-slate-500">{u.email ?? "-"}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{u.conversationCount}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-700">
                          {(u.usage30d?.tokens ?? 0) >= 1000
                            ? `${((u.usage30d.tokens) / 1000).toFixed(1)}K`
                            : String(u.usage30d?.tokens ?? 0)}
                        </span>
                        <span className="ml-1 text-xs text-slate-400">tokens · {u.usage30d?.calls ?? 0}次</span>
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <span className="text-sm text-slate-400">{formatDate(u.createdAt)}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleConversations(u.id)}
                            disabled={u.conversationCount === 0}
                          >
                            <MessageSquare className="size-4" />
                            {expandedUser === u.id ? (
                              <ChevronUp className="size-3 ml-1" />
                            ) : (
                              <ChevronDown className="size-3 ml-1" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => openGrant(u)}
                            disabled={!canGrant || u.isAnonymous}
                            title={
                              !canGrant
                                ? "需要权限管理权限"
                                : u.isAnonymous
                                  ? "匿名用户不可授权"
                                  : "授权角色/套餐"
                            }
                          >
                            <Shield className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {/* 展开的对话列表 */}
                    {expandedUser === u.id && (
                      <tr key={`${u.id}-convs`}>
                        <td colSpan={6} className="bg-slate-50/80 px-8 py-3">
                          {loadingConvs ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="size-4 animate-spin text-slate-300" />
                            </div>
                          ) : conversations.length === 0 ? (
                            <p className="text-sm text-slate-400 py-2">暂无对话</p>
                          ) : (
                            <div className="space-y-2">
                              {conversations.map((conv) => (
                                <div
                                  key={conv.id}
                                  className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 border border-slate-100"
                                >
                                  <div>
                                    <span className="text-sm font-medium text-slate-700">
                                      {conv.title ?? "新对话"}
                                    </span>
                                    <span className="text-xs text-slate-400 ml-3">
                                      {formatDate(conv.createdAt)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="text-xs">
                                      {conv.messageCount} 条消息
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-500" />
              确认删除用户
            </DialogTitle>
            <DialogDescription>
              将永久删除 <span className="font-medium text-slate-700">{deleteTarget?.name ?? deleteTarget?.id}</span> 及其所有对话、简历、投递记录。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 授权对话框 */}
      <Dialog open={!!grantTarget} onOpenChange={(v) => { if (!v) setGrantTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="size-5 text-emerald-500" />
              授权：{grantTarget?.name ?? grantTarget?.id}
            </DialogTitle>
            <DialogDescription>设置该用户的后台角色与套餐</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-slate-400">后台角色</Label>
              {roles.length === 0 ? (
                <p className="text-sm text-slate-400">暂无角色，请先在「权限管理」页创建</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`grant-role-${r.id}`}
                        checked={grantRoles.includes(r.id)}
                        onCheckedChange={() =>
                          setGrantRoles((prev) =>
                            prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id],
                          )
                        }
                      />
                      <Label htmlFor={`grant-role-${r.id}`} className="text-sm text-slate-700 cursor-pointer">
                        {r.label}
                        {r.isBuiltin ? <Badge variant="secondary" className="text-[10px] ml-1.5">内置</Badge> : null}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-slate-400">套餐</Label>
              <Select value={grantPlan} onValueChange={setGrantPlan}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="无套餐" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">无套餐</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {grantPlan && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-slate-400">到期时间（可选，留空永久）</Label>
                <Input
                  type="date"
                  value={grantExpiresAt}
                  onChange={(e) => setGrantExpiresAt(e.target.value)}
                  className="h-9 text-sm w-44"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)} disabled={grantSaving}>
              取消
            </Button>
            <Button onClick={saveGrant} disabled={grantSaving}>
              {grantSaving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
