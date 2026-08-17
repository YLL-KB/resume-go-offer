"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@resume/ui";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@resume/ui";
import { Skeleton } from "@resume/ui";
import { Badge } from "@resume/ui";
import { AppHeader } from "@resume/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@resume/ui";
import { FileText, Plus, Trash2, Copy, Edit3, Loader2, MessageSquare, Eye } from "lucide-react";
import { toast } from "sonner";
import { getResume } from "@/lib/api/resume";
import type { ResumeData } from "@/lib/validators/resume.schema";

interface ResumeItem {
  id: string;
  title: string;
  templateId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** 单张卡片缩略图兜底：渲染出错时只显示错误，不影响其它卡片 */
class CardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-48 w-full items-center justify-center bg-slate-50 px-3 text-xs text-red-500">
          缩略图渲染出错：{String(this.state.error.message)}
        </div>
      );
    }
    return this.props.children;
  }
}

/** 轻量简历缩略图（纯标记，无复杂组件依赖，稳定不崩） */
function ResumeThumbnail({ data }: { data: ResumeData }) {
  const b = (data.basic ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const contacts = [b.email, b.phone, b.location]
    .filter((x): x is string => typeof x === "string" && !!x.trim())
    .map((x) => x as string);
  const summary = typeof data.summary === "string" ? data.summary.trim() : "";
  const exps = (data.experience ?? []).slice(0, 2);
  const skills = (data.skills && data.skills.length > 0 ? data.skills : Object.values(data.categorizedSkills ?? {}).flat()).slice(0, 6);

  return (
    <div className="flex h-48 w-full flex-col gap-1.5 bg-white p-3 text-left">
      <div>
        <p className="truncate text-sm font-bold text-slate-900">{name || "未命名"}</p>
        {title ? <p className="truncate text-xs text-emerald-700">{title}</p> : null}
        {contacts.length > 0 ? (
          <p className="truncate text-[10px] text-slate-400">{contacts.join(" · ")}</p>
        ) : null}
      </div>
      {summary ? (
        <p className="line-clamp-2 text-[10px] leading-relaxed text-slate-500">{summary}</p>
      ) : null}
      {exps.length > 0 ? (
        <div className="space-y-1">
          {exps.map((e, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              <span className="max-w-[45%] shrink-0 truncate font-medium text-slate-700">{e.company || "—"}</span>
              <span className="shrink-0 truncate text-slate-400">{e.title || ""}</span>
            </div>
          ))}
        </div>
      ) : null}
      {skills.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-1">
          {skills.map((s) => (
            <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{s}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ResumeListPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ResumeItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, ResumeData>>({});

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

  // 列表加载后并行拉取每份简历数据，渲染卡片缩略预览
  useEffect(() => {
    if (resumes.length === 0) return;
    let cancelled = false;
    Promise.all(
      resumes.map(async (r) => {
        try {
          const detail = await getResume(r.id);
          return { id: r.id, data: detail.data };
        } catch {
          return { id: r.id, data: null };
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const map: Record<string, ResumeData> = {};
      for (const row of rows) {
        if (row.data) map[row.id] = row.data;
      }
      setPreviews(map);
    });
    return () => {
      cancelled = true;
    };
  }, [resumes]);

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
      <AppHeader />
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {resumes.map((item) => (
              <Card key={item.id} className="group relative overflow-hidden hover:shadow-md transition-shadow">
                {/* 缩略预览：A4 纸面缩小展示，点击进完整预览 */}
                <Button
                  variant="ghost"
                  className="block h-48 w-full overflow-hidden rounded-none border-b border-slate-100 bg-slate-100/60 p-0 text-left"
                  onClick={() => router.push(`/resume/preview?id=${item.id}`)}
                  title="点击预览简历"
                >
                  {previews[item.id] ? (
                    <CardErrorBoundary>
                      <ResumeThumbnail data={previews[item.id]} />
                    </CardErrorBoundary>
                  ) : (
                    <span className="flex h-full items-center justify-center">
                      <Loader2 className="size-4 animate-spin text-slate-300" />
                    </span>
                  )}
                </Button>
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
                <CardFooter className="flex flex-col gap-2 pt-0">
                  <div className="flex w-full gap-2">
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
                      onClick={() => router.push(`/chat?resumeId=${item.id}`)}
                      title="引用到 AI 对话，让顾问继续优化"
                    >
                      <MessageSquare className="size-3.5 mr-1" />
                      引用对话
                    </Button>
                  </div>
                  <div className="flex w-full gap-2">
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
                      className="flex-1 text-red-500 hover:text-red-600 hover:border-red-300"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      删除
                    </Button>
                  </div>
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
