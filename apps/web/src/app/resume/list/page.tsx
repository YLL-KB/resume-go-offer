"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@resume/ui";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@resume/ui";
import { Skeleton } from "@resume/ui";
import { Badge } from "@resume/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@resume/ui";
import { FileText, Plus, Trash2, Copy, Eye, Edit3, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface ResumeItem {
  id: string;
  title: string;
  templateId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export default function ResumeListPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ResumeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchResumes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resume");
      if (res.ok) {
        setResumes(await res.json() as ResumeItem[]);
      }
    } catch {
      toast.error("加载简历列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResumes();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/resume/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setResumes((prev) => prev.filter((r) => r.id !== deleteTarget.id));
        toast.success("已删除");
      } else {
        toast.error("删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleCopy = async (item: ResumeItem) => {
    try {
      const detail = await fetch(`/api/resume/${item.id}`);
      if (!detail.ok) throw new Error("获取简历失败");
      const { data, templateId } = await detail.json() as { data: unknown; templateId: string };
      const create = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${item.title} (副本)`, templateId, data }),
      });
      if (create.ok) {
        const created = await create.json() as { id: string };
        toast.success("已创建副本");
        router.push(`/resume/new?resumeId=${created.id}`);
      } else {
        toast.error("复制失败");
      }
    } catch {
      toast.error("复制失败");
    }
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const templateNames: Record<string, string> = {
    classic: "经典",
    modern: "现代",
    minimal: "极简",
    ocean: "海洋",
    forest: "森林",
    slate: "岩板",
    warm: "暖调",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/chat" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="size-4" />
              返回对话
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">我的简历</h1>
            <p className="mt-1 text-sm text-slate-500">管理已生成的所有简历</p>
          </div>
          <Button onClick={() => router.push("/chat")}>
            <Plus className="size-4 mr-1" />
            新建简历
          </Button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && resumes.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20">
            <FileText className="size-12 text-slate-300 mb-4" />
            <p className="text-slate-500 mb-2">还没有简历</p>
            <p className="text-sm text-slate-400 mb-6">去对话页和 AI 聊聊，快速生成第一份简历</p>
            <Button onClick={() => router.push("/chat")}>去创建简历</Button>
          </div>
        )}

        {/* Grid */}
        {!loading && resumes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resumes.map((item) => (
              <Card key={item.id} className="group relative hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="size-4 text-slate-400 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-2 space-y-1 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span>模版：</span>
                    <Badge variant="secondary" className="text-xs">
                      {templateNames[item.templateId] || item.templateId}
                    </Badge>
                  </div>
                  <div>版本：v{item.version}</div>
                  <div>更新于 {formatDate(item.updatedAt)}</div>
                </CardContent>
                <CardFooter className="flex gap-2 pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/resume/preview?id=${item.id}`)}
                  >
                    <Eye className="size-3.5 mr-1" />
                    预览
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/resume/new?resumeId=${item.id}`)}
                  >
                    <Edit3 className="size-3.5 mr-1" />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(item)}
                    title="创建副本"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(item)}
                    title="删除"
                    className="text-red-500 hover:text-red-600 hover:border-red-300"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除「{deleteTarget?.title}」吗？此操作不可撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                取消
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "删除中..." : "确认删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
