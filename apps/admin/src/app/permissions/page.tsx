"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ShieldCheck, Package, Plus, Pencil, Trash2, ShieldOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Button } from "@resume/ui";
import { Badge } from "@resume/ui";
import { Input } from "@resume/ui";
import { Label } from "@resume/ui";
import { Checkbox } from "@resume/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@resume/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@resume/ui";
import { toast } from "sonner";
import { UserGrantTab } from "./user-grant";

interface PermItem {
  key: string;
  label: string;
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
  priceCents: number | null;
  sortOrder: number;
  isActive: number;
}

function toggle(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key];
}

export default function PermissionsPage() {
  const [meta, setMeta] = useState<{ adminPermissions: PermItem[]; featureFlags: PermItem[] } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // 角色编辑对话框
  const [roleDialog, setRoleDialog] = useState<{ mode: "create" | "edit"; role?: Role } | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);

  // 套餐编辑对话框
  const [planDialog, setPlanDialog] = useState<{ mode: "create" | "edit"; plan?: Plan } | null>(null);
  const [planName, setPlanName] = useState("");
  const [planLabel, setPlanLabel] = useState("");
  const [planFeatures, setPlanFeatures] = useState<string[]>([]);
  const [planPriceYuan, setPlanPriceYuan] = useState<string>("");
  const [planSortOrder, setPlanSortOrder] = useState(0);
  const [planActive, setPlanActive] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const metaRes = await fetch("/api/admin/permissions/meta");
      if (metaRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (!metaRes.ok) throw new Error("meta");
      const metaData = (await metaRes.json()) as { adminPermissions: PermItem[]; featureFlags: PermItem[] };
      setMeta(metaData);

      const [rolesRes, plansRes] = await Promise.all([
        fetch("/api/admin/permissions/roles"),
        fetch("/api/admin/permissions/plans"),
      ]);
      if (!rolesRes.ok || !plansRes.ok) throw new Error("list");
      const rolesData = (await rolesRes.json()) as { roles: Role[] };
      const plansData = (await plansRes.json()) as { plans: Plan[] };
      setRoles(rolesData.roles ?? []);
      setPlans(plansData.plans ?? []);
    } catch {
      toast.error("获取权限数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── 角色操作 ──
  const openRoleCreate = () => {
    setRoleDialog({ mode: "create" });
    setRoleName("");
    setRoleLabel("");
    setRolePerms([]);
  };

  const openRoleEdit = (role: Role) => {
    setRoleDialog({ mode: "edit", role });
    setRoleName(role.name);
    setRoleLabel(role.label);
    setRolePerms(role.permissions);
  };

  const saveRole = async () => {
    if (!roleName.trim() || !roleLabel.trim()) {
      toast.error("角色名和显示名不能为空");
      return;
    }
    setRoleSaving(true);
    try {
      const isEdit = roleDialog?.mode === "edit";
      const isBuiltinEdit = isEdit && !!roleDialog?.role?.isBuiltin;
      // 内置角色的权限不可修改（后端锁定），编辑时只提交显示名
      const payload = isBuiltinEdit
        ? { label: roleLabel.trim() }
        : { name: roleName.trim(), label: roleLabel.trim(), permissions: rolePerms };
      const res = await fetch(
        isEdit ? `/api/admin/permissions/roles/${roleDialog?.role?.id}` : "/api/admin/permissions/roles",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "保存失败");
      }
      toast.success(isEdit ? "角色已更新" : "角色已创建");
      setRoleDialog(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setRoleSaving(false);
    }
  };

  const deleteRole = async (role: Role) => {
    if (!window.confirm(`确认删除角色「${role.label}」？`)) return;
    try {
      const res = await fetch(`/api/admin/permissions/roles/${role.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "删除失败");
      }
      toast.success("角色已删除");
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  // ── 套餐操作 ──
  const openPlanCreate = () => {
    setPlanDialog({ mode: "create" });
    setPlanName("");
    setPlanLabel("");
    setPlanFeatures([]);
    setPlanPriceYuan("");
    setPlanSortOrder(0);
    setPlanActive(true);
  };

  const openPlanEdit = (plan: Plan) => {
    setPlanDialog({ mode: "edit", plan });
    setPlanName(plan.name);
    setPlanLabel(plan.label);
    setPlanFeatures(plan.features);
    setPlanPriceYuan(plan.priceCents != null ? String(plan.priceCents / 100) : "");
    setPlanSortOrder(plan.sortOrder);
    setPlanActive(!!plan.isActive);
  };

  const savePlan = async () => {
    if (!planName.trim() || !planLabel.trim()) {
      toast.error("套餐名和显示名不能为空");
      return;
    }
    setPlanSaving(true);
    try {
      const isEdit = planDialog?.mode === "edit";
      const priceCents = planPriceYuan !== "" ? Math.round(Number(planPriceYuan) * 100) : null;
      const res = await fetch(
        isEdit ? `/api/admin/permissions/plans/${planDialog?.plan?.id}` : "/api/admin/permissions/plans",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: planName.trim(),
            label: planLabel.trim(),
            features: planFeatures,
            priceCents,
            sortOrder: planSortOrder,
            isActive: planActive,
          }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "保存失败");
      }
      toast.success(isEdit ? "套餐已更新" : "套餐已创建");
      setPlanDialog(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setPlanSaving(false);
    }
  };

  const deletePlan = async (plan: Plan) => {
    if (!window.confirm(`确认删除套餐「${plan.label}」？`)) return;
    try {
      const res = await fetch(`/api/admin/permissions/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "删除失败");
      }
      toast.success("套餐已删除");
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  // ── 渲染 ──
  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <ShieldOff className="size-16 text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-700 mb-2">无权限访问</h1>
        <p className="text-sm text-slate-500">你没有「权限管理」的权限</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">权限管理</h1>
        <p className="mt-1 text-sm text-slate-500">人员授权、后台角色与套餐（收费功能地基）</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-slate-300" />
        </div>
      ) : (
        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users">用户授权</TabsTrigger>
            <TabsTrigger value="roles">角色管理</TabsTrigger>
            <TabsTrigger value="plans">套餐管理</TabsTrigger>
          </TabsList>

          {/* ── 用户授权 ── */}
          <TabsContent value="users">
            <UserGrantTab />
          </TabsContent>

          {/* ── 角色管理 ── */}
          <TabsContent value="roles">
            <div className="mb-4 flex justify-end">
              <Button size="sm" onClick={openRoleCreate}>
                <Plus className="size-4 mr-1" />新建角色
              </Button>
            </div>
            {roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20">
                <ShieldCheck className="size-12 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">暂无角色</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map((role) => (
                  <Card key={role.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          {role.label}
                          {role.isBuiltin ? <Badge variant="secondary">内置</Badge> : null}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openRoleEdit(role)}>
                            <Pencil className="size-4" />
                          </Button>
                          {!role.isBuiltin ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteRole(role)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-400 font-mono mb-2">{role.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {role.permissions.includes("*") ? (
                          <Badge className="text-xs bg-slate-100 text-slate-700">全部权限</Badge>
                        ) : role.permissions.length === 0 ? (
                          <span className="text-xs text-slate-400">无权限</span>
                        ) : (
                          role.permissions.map((p) => {
                            const def = meta?.adminPermissions.find((d) => d.key === p);
                            return (
                              <Badge key={p} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {def?.label ?? p}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── 套餐管理 ── */}
          <TabsContent value="plans">
            <div className="mb-4 flex justify-end">
              <Button size="sm" onClick={openPlanCreate}>
                <Plus className="size-4 mr-1" />新建套餐
              </Button>
            </div>
            {plans.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20">
                <Package className="size-12 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">暂无套餐</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.map((plan) => (
                  <Card key={plan.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          {plan.label}
                          {!plan.isActive ? <Badge variant="outline">停用</Badge> : null}
                          {plan.priceCents != null && (
                            <Badge className="text-xs bg-violet-50 text-violet-700 border border-violet-200">
                              ¥{plan.priceCents / 100}/月
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openPlanEdit(plan)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => deletePlan(plan)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-400 font-mono mb-2">{plan.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {plan.features.length === 0 ? (
                          <span className="text-xs text-slate-400">无功能项</span>
                        ) : (
                          plan.features.map((f) => {
                            const def = meta?.featureFlags.find((d) => d.key === f);
                            return (
                              <Badge key={f} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {def?.label ?? f}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* 角色编辑对话框 */}
      <Dialog open={!!roleDialog} onOpenChange={(v) => { if (!v) setRoleDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roleDialog?.mode === "edit" ? "编辑角色" : "新建角色"}</DialogTitle>
            <DialogDescription>勾选该角色拥有的后台页面权限</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">角色名（机器名）</Label>
              <Input
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                disabled={roleDialog?.mode === "edit" && !!roleDialog?.role?.isBuiltin}
                placeholder="如 operator"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">显示名</Label>
              <Input
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder="如 运营"
                className="h-9 text-sm"
              />
            </div>
            {roleDialog?.mode === "edit" && roleDialog?.role?.isBuiltin ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                内置角色的权限是安全边界，不可修改；仅显示名可编辑。
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-slate-400">页面权限</Label>
                <div className="space-y-2">
                  {(meta?.adminPermissions ?? []).map((p) => (
                    <div key={p.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`role-perm-${p.key}`}
                        checked={rolePerms.includes(p.key)}
                        onCheckedChange={() => setRolePerms((prev) => toggle(prev, p.key))}
                      />
                      <Label htmlFor={`role-perm-${p.key}`} className="text-sm text-slate-700 cursor-pointer">
                        {p.label}
                        <span className="ml-1.5 text-xs text-slate-400 font-mono">{p.key}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)} disabled={roleSaving}>
              取消
            </Button>
            <Button onClick={saveRole} disabled={roleSaving}>
              {roleSaving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 套餐编辑对话框 */}
      <Dialog open={!!planDialog} onOpenChange={(v) => { if (!v) setPlanDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{planDialog?.mode === "edit" ? "编辑套餐" : "新建套餐"}</DialogTitle>
            <DialogDescription>勾选该套餐包含的功能项（支付暂未接入）</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">套餐名（机器名）</Label>
              <Input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="如 pro"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-400">显示名</Label>
              <Input
                value={planLabel}
                onChange={(e) => setPlanLabel(e.target.value)}
                placeholder="如 专业版"
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-slate-400">价格（元/月，留空免费）</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={planPriceYuan}
                  onChange={(e) => setPlanPriceYuan(e.target.value)}
                  placeholder="如 19.9"
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-slate-400">排序（数字越小越靠前）</Label>
                <Input
                  type="number"
                  value={planSortOrder}
                  onChange={(e) => setPlanSortOrder(Number(e.target.value) || 0)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="plan-active"
                checked={planActive}
                onCheckedChange={setPlanActive}
              />
              <Label htmlFor="plan-active" className="text-sm text-slate-700 cursor-pointer">
                上架（用户可见）
              </Label>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-slate-400">功能项</Label>
              <div className="space-y-2">
                {(meta?.featureFlags ?? []).map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`plan-feat-${f.key}`}
                      checked={planFeatures.includes(f.key)}
                      onCheckedChange={() => setPlanFeatures((prev) => toggle(prev, f.key))}
                    />
                    <Label htmlFor={`plan-feat-${f.key}`} className="text-sm text-slate-700 cursor-pointer">
                      {f.label}
                      <span className="ml-1.5 text-xs text-slate-400 font-mono">{f.key}</span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(null)} disabled={planSaving}>
              取消
            </Button>
            <Button onClick={savePlan} disabled={planSaving}>
              {planSaving ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
