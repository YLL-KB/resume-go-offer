"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRequest } from "ahooks";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  LayoutTemplate,
  Eye,
  Upload,
  Sparkles,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { TemplateItem } from "@/lib/api/templates";
import {
  getTemplates,
  getTemplateSummary,
  uploadTemplateFile,
  deleteTemplateById,
} from "@/lib/api/templates";

export default function TemplatesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TemplateItem | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [templateSummary, setTemplateSummary] = useState<{
    title: string;
    summary: string;
    loading: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // ⚠️ 管理员权限 — 后续接入用户系统后改为从 auth context 读取
  // ============================================================
  const isAdmin = true; // TODO: 从用户信息获取

  const {
    data: templates = [],
    loading,
    refresh,
  } = useRequest(getTemplates, {
    onError: () => toast.error("加载模版失败"),
  });

  // 摘要
  const { runAsync: runSummary } = useRequest(getTemplateSummary, {
    manual: true,
  });

  // 上传
  const { runAsync: runUploadFile } = useRequest(uploadTemplateFile, {
    manual: true,
  });

  // 删除
  const { runAsync: runDelete } = useRequest(deleteTemplateById, {
    manual: true,
  });

  // 打开预览 + 调用 AI 提取标题和摘要
  const handlePreview = useCallback(
    async (t: TemplateItem) => {
      setPdfPreview(t.url!);
      setPreviewId(t.id);
      setTemplateSummary({ title: "", summary: "", loading: true });

      try {
        const data = await runSummary(t.id);
        setTemplateSummary({
          title: data.title ?? t.name,
          summary: data.summary ?? "",
          loading: false,
        });
      } catch {
        setTemplateSummary({
          title: t.name,
          summary: "AI 摘要获取失败",
          loading: false,
        });
      }
    },
    [runSummary],
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const valid = files.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "pdf";
    });

    if (valid.length !== files.length) {
      toast.error("仅支持 PDF 格式的模版文件");
      return;
    }

    setUploading(true);
    try {
      for (const file of valid) {
        const result = await runUploadFile(file);
        toast.success(`「${result.name}」上传成功`);
      }
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 删除模版（仅管理员 / 仅用户上传的模版）
  const handleDelete = useCallback(
    async (t: TemplateItem) => {
      if (t.builtIn) {
        toast.error("内置模版不可删除");
        return;
      }

      setDeletingId(t.id);
      setConfirmDelete(null);
      try {
        await runDelete(t.id);
        toast.success(`已删除「${t.name}」`);
        refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "删除失败";
        toast.error(msg);
      } finally {
        setDeletingId(null);
      }
    },
    [runDelete, refresh],
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-lg"
          >
            <FileText className="size-5" />
            Resume Go Offer
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <Link
              href="/analyze"
              className="hover:text-foreground transition-colors"
            >
              简历分析
            </Link>
            <Link
              href="/templates"
              className="text-foreground font-medium transition-colors"
            >
              选择模版
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Button asChild size="sm">
              <Link href="/resume/new">开始制作</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* 页面标题 */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">选择模版</h1>
            <p className="mt-2 text-muted-foreground">
              选择适合你的简历模版，选定后可在编辑器中随时切换。
            </p>
          </div>
          <div className="hidden sm:block">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-4" />
              )}
              {uploading ? "上传中..." : "上传模版 (PDF)"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                  <Skeleton className="mt-4 h-5 w-2/3" />
                  <Skeleton className="mt-2 h-4 w-full" />
                  <Skeleton className="mt-3 h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Upload className="size-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">
              还没有模版
            </h3>
            <p className="mt-2 text-sm text-muted-foreground/70 max-w-sm">
              上传一份 PDF 简历作为模版，方便后续制作时快速切换。
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 size-4" />
              上传第一份模版
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t, i) => (
              <div key={t.id}>
                <Card
                  className={`cursor-pointer border-2 transition-all hover:shadow-md ${
                    selected === t.id
                      ? "border-primary shadow-sm"
                      : "border-border/60"
                  }`}
                  onClick={() => setSelected(t.id)}
                >
                  <CardContent className="p-4">
                    {/* 预览区 */}
                    <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-muted overflow-hidden">
                      {!t.builtIn && t.url ? (
                        <div
                          className="relative w-full h-full cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(t);
                          }}
                        >
                          <iframe
                            src={`${t.url}#view=FitH&toolbar=0&navpanes=0`}
                            className="w-full h-full pointer-events-none"
                            title={t.name}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                            <Eye className="size-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ) : (
                        <LayoutTemplate className="size-12 text-muted-foreground/40" />
                      )}
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{t.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {t.desc}
                        </p>
                        {!t.builtIn && t.uploadedAt && (
                          <p className="mt-1 text-xs text-muted-foreground/60">
                            上传于{" "}
                            {new Date(t.uploadedAt).toLocaleDateString("zh-CN")}
                          </p>
                        )}
                      </div>
                      {t.popular && (
                        <Badge
                          variant="default"
                          className="shrink-0 gap-1 px-2.5 py-0.5"
                        >
                          <Sparkles className="size-3" />
                          推荐
                        </Badge>
                      )}
                    </div>

                    {!t.builtIn && t.url && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(t);
                          }}
                        >
                          <Eye className="mr-1 size-3.5" />
                          预览
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={`/uploads/templates/${t.id}.pdf`}
                            download={`${t.name}.pdf`}
                          >
                            <FileText className="mr-1 size-3.5" />
                            下载
                          </a>
                        </Button>
                      </div>
                    )}

                    {!t.builtIn && isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingId === t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(t);
                        }}
                      >
                        {deletingId === t.id ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1.5 size-4" />
                        )}
                        删除
                      </Button>
                    )}
                    <Button
                      asChild
                      variant={selected === t.id ? "default" : "outline"}
                      size="sm"
                      className="w-full mt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/resume/new?template=${t.id}`}>
                        <Eye className="mr-1.5 size-4" />
                        使用此模版
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ))}

            {/* 移动端上传入口 */}
            <div className="sm:hidden">
              <Card className="border-dashed border-2 border-muted-foreground/30">
                <CardContent className="flex flex-col items-center justify-center p-4">
                  <Button
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex flex-col items-center gap-2 py-8 h-auto w-full"
                  >
                    {uploading ? (
                      <Loader2 className="size-8 animate-spin" />
                    ) : (
                      <Upload className="size-8" />
                    )}
                    <span className="text-sm font-medium">
                      {uploading ? "上传中..." : "上传模版 (PDF)"}
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* PDF 预览弹窗 */}
      <Dialog
        open={!!pdfPreview}
        onOpenChange={(open) => {
          if (!open) {
            setPdfPreview(null);
            setPreviewId(null);
            setTemplateSummary(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <DialogTitle className="truncate">
                {templateSummary?.title
                  ? `模版预览 — ${templateSummary.title}`
                  : "模版预览"}
              </DialogTitle>
              {templateSummary?.loading && (
                <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
              )}
            </div>
          </DialogHeader>
          <div className="flex flex-1 min-h-0">
            {/* 左侧：PDF 预览 */}
            <div className="flex-1 min-w-0">
              {pdfPreview && (
                <iframe
                  src={`${pdfPreview}#toolbar=1`}
                  className="w-full h-full"
                  title="模版预览"
                />
              )}
            </div>
            {/* 右侧：AI 摘要面板 */}
            {templateSummary && (
              <div className="w-72 shrink-0 border-l bg-muted/20 p-4 overflow-y-auto">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" />
                  AI 识别摘要
                </h4>

                {templateSummary.loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    {templateSummary.title && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          标题
                        </p>
                        <p className="font-medium leading-snug">
                          {templateSummary.title}
                        </p>
                      </div>
                    )}
                    {templateSummary.summary && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          摘要
                        </p>
                        <p className="text-muted-foreground leading-relaxed text-xs">
                          {templateSummary.summary}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 确认删除弹窗 */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除模版「{confirmDelete?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              disabled={deletingId === confirmDelete?.id}
              onClick={() => {
                if (confirmDelete) handleDelete(confirmDelete);
              }}
            >
              {deletingId === confirmDelete?.id ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-4" />
              )}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
