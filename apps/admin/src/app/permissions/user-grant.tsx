"use client";

/**
 * UserGrantTab — 权限管理页的「用户授权」Tab
 *
 * 人员管理：搜索用户、预建人员（按 GitHub 用户名占位，对方首次登录自动关联生效）、
 * 行内授权（后台角色 + 套餐 + 到期时间）、删除用户。
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search, Shield, Trash2, UserPlus, AlertTriangle, Clock } from "lucide-react";
import { Button, Badge, Input, Label, Checkbox } from "@resume/ui";
import { Avatar, AvatarImage, AvatarFallback } from "@resume/ui";
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

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
  createdAt: string;
  roles: string[];
  roleIds: string[];
  plan: string | null;
  planId: string | null;
  isAnonymous: boolean;
  pendingLogin: boolean;
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
  isActive: number;
}

export function UserGrantTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // 添加人员弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoleIds, setNewRoleIds] = useState<string[]>([]);
  const [newPlanId, setNewPlanId] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);

  // 授权弹窗
  const [grantTarget, setGrantTarget] = useState<UserRow | null>(null);
  const [grantRoleIds, setGrantRoleIds] = useState<string[]>([]);
  const [grantPlanId, setGrantPlanId] = useState("");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [granting, setGranting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const query = search?.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/admin/users${query}`);
      if (!res.ok) throw new Error("获取失败");
      const data = (await res.json()) as { users: UserRow[] };
      setUsers(data.users ?? []);
    } catch {
      toast.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/permissions/roles"),
      fetch("/api/admin/permissions/plans"),
    ])
      .then(async ([rolesRes, plansRes]) => {
        if (rolesRes.ok) setRoles(((await rolesRes.json()) as { roles: Role[] }).roles ?? []);
        if (plansRes.ok) setPlans(((await plansRes.json()) as { plans: Plan[] }).plans ?? []);
      })
      .catch(() => {});
  }, []);

  // ── 添加人员 ──
  const openCreate = () => {
    setNewLogin("");
    setNewName("");
    setNewRoleIds([]);
    setNewPlanId("");
    setNewExpiresAt("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!newLogin.trim()) {
      toast.error("请输入 GitHub 用户名");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubLogin: newLogin.trim(),
          name: newName.trim() || undefined,
          roleIds: newRoleIds,
          planId: newPlanId || null,
          expiresAt: newExpiresAt || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "添加失败");
      }
      toast.success(`已添加 ${newLogin.trim()}，对方用该 GitHub 账号登录后权限自动生效`);
      setCreateOpen(false);
      fetchUsers(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "添加失败");
    } finally {
      setCreating(false);
    }
  };

  // ── 授权 ──
  const openGrant = (u: UserRow) => {
    setGrantTarget(u);
    setGrantRoleIds(u.roleIds ?? []);
    setGrantPlanId(u.planId ?? "");
    setGrantExpiresAt("");
  };

  const handleGrant = async () => {
    if (!grantTarget) return;
    setGranting(true);
    try {
      const [rolesRes, planRes] = await Promise.all([
        fetch(`/api/admin/users/${grantTarget.id}/roles`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleIds: grantRoleIds }),
        }),
        fetch(`/api/admin/users/${grantTarget.id}/plan`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: grantPlanId || null, expiresAt: grantExpiresAt || null }),
        }),
      ]);
      if (!rolesRes.ok || !planRes.ok) {
        const body = !rolesRes.ok
          ? ((await rolesRes.json().catch(() => null)) as { error?: string } | null)
          : ((await planRes.json().catch(() => null)) as { error?: string } | null);
        throw new Error(body?.error ?? "保存失败");
      }
      toast.success("已更新授权");
      setGrantTarget(null);
      fetchUsers(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setGranting(false);
    }
  };

  // ── 删除 ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "删除失败");
      }
      toast.success(`已删除 ${deleteTarget.name ?? deleteTarget.githubLogin ?? deleteTarget.id}`);
      setDeleteTarget(null);
      fetchUsers(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const toggleArr = (arr: string[], key: string) =>
    arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key];

  return (
    <div>
      {/* 工具栏 */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") fetchUsers(q); }}
            placeholder="搜索姓名 / GitHub / 邮箱..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => fetchUsers(q)}>
          搜索
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>
          <UserPlus className="size-4 mr-1" />添加人员
        </Button>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        添加人员：输入对方的 GitHub 用户名预建账号并分配角色，对方首次用 GitHub 登录后自动生效；
        已登录用户可直接点盾牌按钮授权。
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-slate-300" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16">
          <UserPlus className="size-10 text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">{q ? "没有匹配的用户" : "暂无人员，点右上角「添加人员」"}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="py-3 px-4 text-xs font-medium text-slate-400">人员</th>
                <th className="py-3 px-4 text-xs font-medium text-slate-400">角色 / 套餐</th>
                <th className="py-3 px-4 text-xs font-medium text-slate-400 hidden sm:table-cell">状态</th>
                <th className="py-3 px-4 text-xs font-medium text-slate-400 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={u.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                          {(u.name ?? u.githubLogin ?? "U").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {u.name ?? "未命名"}
                        </div>
                        <div className="text-xs text-slate-400">
                          {u.githubLogin ?? "—"}{u.email ? ` · ${u.email}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-slate-300">无角色</span>
                      ) : (
                        u.roles.map((r) => (
                          <Badge key={r} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {r}
                          </Badge>
                        ))
                      )}
                      {u.plan && (
                        <Badge className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200">
                          {u.plan}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 hidden sm:table-cell">
                    {u.pendingLogin ? (
                      <Badge className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="size-3 mr-0.5" />待登录
                      </Badge>
                    ) : u.isAnonymous ? (
                      <span className="text-xs text-slate-400">匿名</span>
                    ) : (
                      <Badge className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200">
                        已激活
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => openGrant(u)}
                        disabled={u.isAnonymous}
                        title={u.isAnonymous ? "匿名用户不可授权" : "授权角色/套餐"}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 添加人员弹窗 */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) setCreateOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5 text-emerald-500" />
              添加人员
            </DialogTitle>
            <DialogDescription>
              输入对方的 GitHub 用户名，对方用该账号登录后权限自动生效
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">GitHub 用户名（必填）</Label>
              <Input
                value={newLogin}
                onChange={(e) => setNewLogin(e.target.value)}
                placeholder="如 octocat"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">姓名（可选）</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如 张三"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-slate-400">后台角色</Label>
              {roles.length === 0 ? (
                <p className="text-sm text-slate-400">暂无角色，请先在「角色管理」Tab 创建</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-role-${r.id}`}
                        checked={newRoleIds.includes(r.id)}
                        onCheckedChange={() => setNewRoleIds((prev) => toggleArr(prev, r.id))}
                      />
                      <Label htmlFor={`new-role-${r.id}`} className="text-sm text-slate-700 cursor-pointer">
                        {r.label}
                        {r.isBuiltin ? <Badge variant="secondary" className="text-[10px] ml-1.5">内置</Badge> : null}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">套餐（可选）</Label>
              <Select value={newPlanId} onValueChange={setNewPlanId}>
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
            {newPlanId && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-slate-400">到期时间（可选，留空永久）</Label>
                <Input
                  type="date"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                  className="h-9 text-sm w-44"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 授权弹窗 */}
      <Dialog open={!!grantTarget} onOpenChange={(v) => { if (!v) setGrantTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="size-5 text-emerald-500" />
              授权：{grantTarget?.name ?? grantTarget?.githubLogin ?? grantTarget?.id}
            </DialogTitle>
            <DialogDescription>设置该用户的后台角色与套餐</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-slate-400">后台角色</Label>
              {roles.length === 0 ? (
                <p className="text-sm text-slate-400">暂无角色，请先在「角色管理」Tab 创建</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`grant-role-${r.id}`}
                        checked={grantRoleIds.includes(r.id)}
                        onCheckedChange={() => setGrantRoleIds((prev) => toggleArr(prev, r.id))}
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
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">套餐</Label>
              <Select value={grantPlanId} onValueChange={setGrantPlanId}>
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
            {grantPlanId && (
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
            <Button variant="outline" onClick={() => setGrantTarget(null)} disabled={granting}>
              取消
            </Button>
            <Button onClick={handleGrant} disabled={granting}>
              {granting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-500" />
              确认删除人员
            </DialogTitle>
            <DialogDescription>
              将永久删除 <span className="font-medium text-slate-700">{deleteTarget?.name ?? deleteTarget?.githubLogin ?? deleteTarget?.id}</span> 及其角色/套餐授权。此操作不可撤销。
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
    </div>
  );
}
