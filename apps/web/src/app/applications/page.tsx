"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@resume/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Badge } from "@resume/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@resume/ui";
import { Input } from "@resume/ui";
import { Textarea } from "@resume/ui";
import { Label } from "@resume/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,

} from "@resume/ui";
import { ArrowLeft, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface Application {
  id: string;
  userId: string;
  resumeId: string;
  company: string;
  position: string;
  status: string;
  appliedAt: string;
  notes: string;
}

const STATUSES = ["applied", "screening", "interview", "offer", "rejected"] as const;

const STATUS_LABELS: Record<string, string> = {
  applied: "已投递",
  screening: "筛选中",
  interview: "面试",
  offer: "Offer",
  rejected: "已拒",
};

const STATUS_COLORS: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700",
  screening: "bg-yellow-100 text-yellow-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [form, setForm] = useState({ company: "", position: "", resumeId: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/applications");
      if (res.ok) setApps(await res.json() as Application[]);
    } catch {
      toast.error("加载投递列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleAdd = async () => {
    if (!form.company.trim() || !form.position.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("已添加投递记录");
        setShowAdd(false);
        setForm({ company: "", position: "", resumeId: "", notes: "" });
        fetchApps();
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? "添加失败");
      }
    } catch {
      toast.error("添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } catch {
      toast.error("更新失败");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/applications/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setApps((prev) => prev.filter((a) => a.id !== deleteTarget.id));
        toast.success("已删除");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleteTarget(null);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("zh-CN");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/chat" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="size-4" /> 返回对话
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">投递追踪</h1>
            <p className="mt-1 text-sm text-slate-500">追踪所有简历投递进度</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="size-4 mr-1" /> 新增投递
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className="size-2.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20">
            <GripVertical className="size-12 text-slate-300 mb-4" />
            <p className="text-slate-500 mb-2">还没有投递记录</p>
            <p className="text-sm text-slate-400 mb-6">
              记录每一次投递，追踪从投递到 Offer 的全过程
            </p>
            <Button onClick={() => setShowAdd(true)}>记录第一份投递</Button>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-4">
            {STATUSES.map((status) => {
              const items = apps.filter((a) => a.status === status);
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                    <span className="text-xs text-slate-400">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((app) => (
                      <Card key={app.id} className="group text-sm">
                        <CardHeader className="pb-2 pt-3 px-3">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <CardTitle className="text-sm truncate">{app.company}</CardTitle>
                              <p className="text-xs text-slate-500 truncate">{app.position}</p>
                            </div>
                            <Select
                              value={app.status}
                              onValueChange={(v) => handleStatusChange(app.id, v)}
                            >
                              <SelectTrigger className="h-7 w-7 p-0 border-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                              <SelectContent>
                                {STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardHeader>
                        <CardContent className="pb-2 px-3 space-y-1">
                          <div className="text-xs text-slate-400">{formatDate(app.appliedAt)}</div>
                          {app.notes && (
                            <p className="text-xs text-slate-500 line-clamp-2">{app.notes}</p>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(app)}
                            className="text-xs text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all h-auto py-0"
                          >
                            <Trash2 className="size-3" /> 删除
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增投递</DialogTitle>
              <DialogDescription>记录一个新的投递</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>公司 *</Label>
                <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="例如：字节跳动" />
              </div>
              <div>
                <Label>职位 *</Label>
                <Input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="例如：前端工程师" />
              </div>
              <div>
                <Label>备注</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="JD 链接、投递渠道等" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
              <Button onClick={handleAdd} disabled={submitting || !form.company.trim() || !form.position.trim()}>
                {submitting ? "添加中..." : "添加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除「{deleteTarget?.company} - {deleteTarget?.position}」吗？
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
