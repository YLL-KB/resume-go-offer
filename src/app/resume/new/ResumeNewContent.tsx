"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useRequest } from "ahooks";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, FileText, Loader2, Save, Download, Check, Trash2, Undo2, Plus, X } from "lucide-react";
const ClickablePdfView = dynamic(() => import("@/components/preview/ClickablePdfView").then(m => m.ClickablePdfView), { ssr: false });
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { getTemplates } from "@/lib/api/templates";
import { createResume, updateResume } from "@/lib/api/resume";
import type { TemplateItem } from "@/lib/api/templates";
import type { ResumeData } from "@/lib/validators/resume.schema";
import type { RichTextBlock } from "@/lib/pdf/text-extractor";
import { extractTextBlocks } from "@/lib/pdf/text-extractor";
import { useEditorStore } from "@/stores/editor-store";

const EMPTY: ResumeData = { basic: { name:"",email:"",phone:"",location:"",website:"",title:"" }, summary:"", education:[], experience:[], projects:[], skills:[] };

export function ResumeNewContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template") ?? undefined;
  const { data: uploaded = [] } = useRequest(getTemplates);
  const tpl = templateId ? uploaded.find((t: TemplateItem) => t.id === templateId) : undefined;
  const pdfUrl = tpl ? `/uploads/templates/${tpl.id}.pdf` : undefined;

  const parsing = useEditorStore(s => s.parsing);
  const saving = useEditorStore(s => s.saving);
  const saved = useEditorStore(s => s.saved);
  const resumeId = useEditorStore(s => s.resumeId);
  const setParsing = useEditorStore(s => s.setParsing);
  const setSaving = useEditorStore(s => s.setSaving);
  const setSaved = useEditorStore(s => s.setSaved);
  const setResumeId = useEditorStore(s => s.setResumeId);

  // Custom pages
  const customPages = useEditorStore(s => s.customPages);
  const addCustomPage = useEditorStore(s => s.addCustomPage);
  const removeCustomPage = useEditorStore(s => s.removeCustomPage);
  const updateCustomPage = useEditorStore(s => s.updateCustomPage);

  const [blocks, setBlocks] = useState<RichTextBlock[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [deletedBlocks, setDeletedBlocks] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [previewPages, setPreviewPages] = useState<string[] | null>(null);
  const [activePage, setActivePage] = useState<string>("template");
  const listRef = useRef<HTMLDivElement>(null);

  // Extract text blocks
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      setParsing(true);
      try {
        const b = await extractTextBlocks(pdfUrl);
        if (!cancelled && b.length) { setBlocks(b); setEdits({}); }
      } catch { /* ignore */ }
      finally { if (!cancelled) setParsing(false); }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl, setParsing]);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true); setSaved(false);
    try {
      const payload = { ...EMPTY, blocks, edits, customPages };
      if (resumeId) await updateResume(resumeId, payload as unknown as never);
      else { const c = await createResume({ title: tpl?.name??"未命名", templateId: templateId??"classic", data: payload as unknown as never }); setResumeId(c.id); }
      setSaved(true); setTimeout(() => setSaved(false), 2500); toast.success("已保存");
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  }, [resumeId, blocks, edits, templateId, tpl, customPages, setResumeId, setSaving, setSaved]);

  const toggleDelete = useCallback((globalIndex: number) => {
    setDeletedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(globalIndex)) next.delete(globalIndex);
      else next.add(globalIndex);
      return next;
    });
  }, []);

  // Export: 逐块原位编辑 + 自定义页
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // 所有块的原位编辑
      const strayEdits = blocks
        .filter(b => deletedBlocks.has(b.globalIndex) || edits[b.globalIndex]?.trim())
        .map(b => ({
          page: b.page, x: b.x, y: b.y, w: b.width, h: b.height,
          fontSize: b.fontSize,
          text: deletedBlocks.has(b.globalIndex) ? "" : edits[b.globalIndex],
          color: b.color,
        }));

      // 自定义页
      const customPageList = customPages.filter(p => p.markdown.trim());

      if (!strayEdits.length && !customPageList.length) { toast.warning("没有修改"); return; }

      const res = await fetch(`/api/templates/${tpl?.id}/fill`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strayEdits,
          customPages: customPageList.map(p => ({ markdown: p.markdown })),
        }),
      });
      if (!res.ok) { toast.error("生成失败"); return; }
      const { url } = await res.json() as { url: string };
      setPreviewPages([url]);
      toast.success("PDF 已生成");
    } catch { toast.error("导出失败"); }
    finally { setExporting(false); }
  }, [blocks, edits, deletedBlocks, tpl, customPages]);

  const handleDownload = useCallback(() => {
    if (!previewPages?.length) return;
    window.open(previewPages[0], "_blank");
  }, [previewPages]);

  const handleAddPage = useCallback(() => {
    addCustomPage();
    const newId = `custom-${customPages.length}`;
    setActivePage(newId);
  }, [addCustomPage, customPages.length]);

  const handleRemovePage = useCallback((pageId: string) => {
    removeCustomPage(pageId);
    if (activePage === pageId) setActivePage("template");
  }, [removeCustomPage, activePage]);

  return (
    <div className="h-dvh flex flex-col bg-background">
      <header className="shrink-0 flex items-center gap-3 border-b px-4 h-12">
        <Button variant="ghost" size="sm" asChild><Link href="/templates" className="gap-1.5"><ArrowLeft className="size-4"/><span className="hidden sm:inline">返回</span></Link></Button>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate flex-1"><FileText className="size-3.5 inline mr-1"/>{tpl?.name??"简历编辑"}</span>
        {parsing && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="size-3 animate-spin"/>解析中</span>}
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving||parsing} className="gap-1.5">
          {saving?<><Loader2 className="size-3.5 animate-spin"/>保存中...</>:saved?<><Check className="size-3.5"/>已保存</>:<><Save className="size-3.5"/>保存</>}
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting||parsing} className="gap-1.5">
          {exporting?<><Loader2 className="size-3.5 animate-spin"/>生成中...</>:<>生成预览</>}
        </Button>
        <Button size="sm" onClick={handleDownload} disabled={!previewPages} className="gap-1.5"><Download className="size-3.5"/>下载 PDF</Button>
      </header>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
        {/* Left: PDF preview */}
        <section className="overflow-auto bg-muted/30 flex flex-col border-r">
          {parsing ? (
            <div className="flex items-center justify-center flex-1 gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin"/><span className="text-xs">解析中...</span></div>
          ) : previewPages ? (
            <iframe src={previewPages[0]} className="flex-1 w-full" title="PDF 预览" />
          ) : pdfUrl ? (
            <ClickablePdfView url={pdfUrl} modules={[]} activeModuleId={null} onModuleClick={()=>{}} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">请选择模版</div>
          )}
        </section>
        {/* Right: Editor with tabs */}
        <section className="flex flex-col min-h-0">
          {/* Page tabs */}
          <div className="shrink-0 flex items-center border-b bg-muted/20 overflow-x-auto">
            <button
              onClick={() => setActivePage("template")}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs border-b-2 transition-colors ${
                activePage === "template"
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="size-3" />
              第1页 (模版)
            </button>
            {customPages.map((page, idx) => (
              <button
                key={page.id}
                onClick={() => setActivePage(page.id)}
                className={`shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs border-b-2 transition-colors group ${
                  activePage === page.id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="size-3" />
                第{idx + 2}页
                <span
                  onClick={(e) => { e.stopPropagation(); handleRemovePage(page.id); }}
                  className="ml-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                  title="删除此页"
                >
                  <X className="size-3" />
                </span>
              </button>
            ))}
            <button
              onClick={handleAddPage}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="添加自定义页面"
            >
              <Plus className="size-3" />
              添加页面
            </button>
          </div>

          {/* Page content */}
          {activePage === "template" ? (
            <>
              <div className="shrink-0 px-4 py-2 border-b text-xs font-semibold text-muted-foreground">文字块编辑 ({blocks.length})</div>
              <div ref={listRef} className="flex-1 overflow-auto p-2 space-y-1">
                {blocks.map(b => {
                  const isDeleted = deletedBlocks.has(b.globalIndex);
                  return (
                  <div key={b.globalIndex} className={`border rounded p-2 text-xs ${isDeleted ? "opacity-40 bg-muted/30" : ""}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[10px] text-muted-foreground flex-1">
                        #{b.globalIndex} · p{b.page} · {b.fontSize}px
                        {isDeleted && <span className="ml-1 text-destructive line-through">已删除</span>}
                      </span>
                      <button
                        onClick={() => toggleDelete(b.globalIndex)}
                        title={isDeleted ? "恢复" : "删除此块"}
                        className={`p-0.5 rounded transition-colors ${isDeleted ? "text-green-500 hover:bg-green-50" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                      >
                        {isDeleted ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                      </button>
                    </div>
                    <textarea
                      value={edits[b.globalIndex] ?? b.text}
                      onChange={e => setEdits(prev => ({ ...prev, [b.globalIndex]: e.target.value }))}
                      className="w-full text-xs resize-none border-0 bg-transparent focus:outline-none"
                      rows={Math.max(1, Math.ceil(b.text.length / 40))}
                      disabled={isDeleted}
                    />
                  </div>
                )})}
              </div>
            </>
          ) : (
            (() => {
              const pageIdx = customPages.findIndex(p => p.id === activePage);
              const pageMarkdown = pageIdx >= 0 ? customPages[pageIdx].markdown : "";
              return (
                <>
                  <div className="shrink-0 px-4 py-2 border-b text-xs font-semibold text-muted-foreground">
                    自定义编辑 · 第{pageIdx + 2}页
                  </div>
                  <div className="flex-1 overflow-auto">
                    <RichTextEditor
                      value={pageMarkdown}
                      onChange={(html) => updateCustomPage(activePage, html)}
                      placeholder="在此输入自定义页内容（支持标题、列表、加粗、斜体等格式）"
                      minHeight="400px"
                    />
                  </div>
                </>
              );
            })()
          )}
        </section>
      </div>
    </div>
  );
}
