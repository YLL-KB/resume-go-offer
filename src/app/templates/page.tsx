"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRequest } from "ahooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FileText, Eye, Upload, Sparkles, Loader2, Trash2, LayoutTemplate, FileUp, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/ui/app-header";
import type { TemplateItem } from "@/lib/api/templates";
import { getTemplates, uploadTemplateFile, deleteTemplateById } from "@/lib/api/templates";

// ── 动画 ──
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" as const },
};

const staggerItem = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay: i * 0.06, ease: "easeOut" as const },
});

// ── 骨架屏 ──
function CardSkeleton() {
  return (
    <Card className="border-border/40 overflow-hidden">
      <CardContent className="p-0">
        <Skeleton className="aspect-[3/4] w-full rounded-none" />
        <div className="p-4 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function TemplatesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TemplateItem | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = true;

  const { data: templates = [], loading, refresh } = useRequest(getTemplates, {
    onError: () => toast.error("加载模版失败"),
  });

  const { runAsync: runUploadFile } = useRequest(uploadTemplateFile, { manual: true });
  const { runAsync: runDelete } = useRequest(deleteTemplateById, { manual: true });

  const handlePreview = useCallback((t: TemplateItem) => {
    setPdfPreview(t.url!);
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const valid = files.filter(f => f.name.split(".").pop()?.toLowerCase() === "pdf");
    if (valid.length !== files.length) { toast.error("仅支持 PDF 格式的模版文件"); return; }
    setUploading(true);
    try {
      for (const file of valid) {
        const result = await runUploadFile(file);
        toast.success(`「${result.name}」上传成功`);
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = useCallback(async (t: TemplateItem) => {
    if (t.builtIn) { toast.error("内置模版不可删除"); return; }
    setDeletingId(t.id); setConfirmDelete(null);
    try {
      await runDelete(t.id);
      toast.success(`已删除「${t.name}」`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally { setDeletingId(null); }
  }, [runDelete, refresh]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* ═══ 页面标题 ═══ */}
        <motion.div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" {...fadeUp}>
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 ring-1 ring-primary/10">
              <LayoutTemplate className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">选择模版</h1>
              <p className="mt-1 text-muted-foreground text-sm">挑选专业模板，一键应用到简历。</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Upload className="mr-1.5 size-4" />}
              {uploading ? "上传中..." : "上传模版"}
            </Button>
            <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
          </div>
        </motion.div>

        {/* ═══ 内容区 ═══ */}
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : templates.length === 0 ? (
          // 空状态
          <motion.div className="flex flex-col items-center justify-center py-24 text-center" {...fadeUp}>
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted"
            >
              <FileUp className="size-7 text-muted-foreground/40" />
            </motion.div>
            <h3 className="text-lg font-semibold text-muted-foreground">还没有模版</h3>
            <p className="mt-1.5 max-w-xs text-sm text-muted-foreground/70">
              上传一份 PDF 简历作为模版，方便后续制作时快速切换。
            </p>
            <Button variant="outline" className="mt-6" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-1.5 size-4" />
              上传第一份模版
            </Button>
            <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
          </motion.div>
        ) : (
          // 模板卡片网格
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t, i) => {
              const isSelected = selected === t.id;
              return (
                <motion.div key={t.id} {...staggerItem(i)}>
                  <Card
                    className={cn(
                      "group relative overflow-hidden border-2 transition-all duration-300 cursor-pointer",
                      isSelected
                        ? "border-primary shadow-md shadow-primary/10"
                        : "border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
                    )}
                    onClick={() => setSelected(t.id)}
                  >
                    <CardContent className="p-0">
                      {/* 预览区 */}
                      <div className="relative aspect-[3/4] bg-muted/50 overflow-hidden">
                        {!t.builtIn && t.url ? (
                          <>
                            <iframe
                              src={`${t.url}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                              className="w-full h-full pointer-events-none"
                              title={t.name}
                            />
                            {/* Hover 遮罩 */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 shadow-lg"
                                onClick={(e) => { e.stopPropagation(); handlePreview(t); }}
                              >
                                <Eye className="mr-1.5 size-3.5" />快速预览
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <LayoutTemplate className="size-14 text-muted-foreground/25" />
                          </div>
                        )}

                        {/* 顶部标签 */}
                        <div className="absolute top-2 left-2 flex gap-1.5">
                          {t.builtIn && (
                            <Badge variant="secondary" className="bg-background/80 backdrop-blur text-[10px] shadow-sm">内置</Badge>
                          )}
                          {t.popular && (
                            <Badge className="gap-1 bg-primary text-primary-foreground text-[10px] shadow-sm">
                              <Sparkles className="size-2.5" />推荐
                            </Badge>
                          )}
                        </div>

                        {/* 选中标记 */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M2 7l3.5 4L12 3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* 信息区 */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{t.desc}</p>
                          </div>
                        </div>

                        {!t.builtIn && t.uploadedAt && (
                          <p className="mt-2 text-[11px] text-muted-foreground/50">
                            {new Date(t.uploadedAt).toLocaleDateString("zh-CN")} 上传
                          </p>
                        )}

                        {/* 操作按钮 */}
                        <div className="mt-3 space-y-2">
                          <Button asChild variant={isSelected ? "default" : "outline"} size="sm" className="w-full h-9"
                            onClick={e => e.stopPropagation()}>
                            <Link href={`/resume/new?template=${t.id}`}>
                              {isSelected ? "已选择，开始制作" : "使用此模版"}
                              {isSelected && <ArrowRight className="ml-1 size-3.5" />}
                            </Link>
                          </Button>

                          {/* 展开操作 */}
                          {!t.builtIn && (
                            <div className="flex gap-1.5">
                              {t.url && (
                                <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs"
                                  onClick={e => { e.stopPropagation(); handlePreview(t); }}>
                                  <Eye className="mr-1 size-3" />预览
                                </Button>
                              )}
                              {t.url && (
                                <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" asChild
                                  onClick={e => e.stopPropagation()}>
                                  <a href={`/uploads/templates/${t.id}.pdf`} download={`${t.name}.pdf`}>
                                    <FileText className="mr-1 size-3" />下载
                                  </a>
                                </Button>
                              )}
                              {isAdmin && (
                                <Button variant="ghost" size="sm"
                                  className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  disabled={deletingId === t.id}
                                  onClick={e => { e.stopPropagation(); setConfirmDelete(t); }}>
                                  {deletingId === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}

            {/* 移动端上传卡片 */}
            <motion.div {...staggerItem(templates.length)} className="sm:hidden">
              <Card
                className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                    <Upload className="size-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    {uploading ? "上传中..." : "上传新模版"}
                  </p>
                  {uploading && <Loader2 className="mt-2 size-5 animate-spin text-muted-foreground" />}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </main>

      {/* ═══ PDF 预览弹窗 ═══ */}
      <Dialog open={!!pdfPreview} onOpenChange={open => { if (!open) setPdfPreview(null); }}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0 space-y-0">
            <DialogTitle>模版预览</DialogTitle>
            <Button variant="ghost" size="sm" onClick={() => setPdfPreview(null)}>关闭</Button>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {pdfPreview && (
              <iframe src={`${pdfPreview}#toolbar=1`} className="w-full h-full" title="模版预览" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ 确认删除弹窗 ═══ */}
      <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除模版「{confirmDelete?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={deletingId === confirmDelete?.id}
              onClick={() => { if (confirmDelete) handleDelete(confirmDelete); }}
            >
              {deletingId === confirmDelete?.id ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Trash2 className="mr-1.5 size-4" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
