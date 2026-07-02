"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useRequest } from "ahooks";
import Link from "next/link";
import dynamic from "next/dynamic";
import NextImage from "next/image";
import { ArrowLeft, FileText, Loader2, Save, Download, Check } from "lucide-react";
const ClickablePdfView = dynamic(() => import("@/components/preview/ClickablePdfView").then(m => m.ClickablePdfView), { ssr: false });
import { Button } from "@/components/ui/button";
import { getTemplates } from "@/lib/api/templates";
import { createResume, updateResume } from "@/lib/api/resume";
import type { TemplateItem } from "@/lib/api/templates";
import type { ResumeData } from "@/lib/validators/resume.schema";
import { extractMarkdown, type ContentItem } from "@/lib/pdf/mineru-extractor";
import { renderAllPages, downloadPdf } from "@/lib/pdf/page-renderer";
import { useEditorStore } from "@/stores/editor-store";

const EMPTY: ResumeData = { basic: { name:"",email:"",phone:"",location:"",website:"",title:"" }, summary:"", education:[], experience:[], projects:[], skills:[] };

export function ResumeNewContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template") ?? undefined;
  const { data: uploaded = [] } = useRequest(getTemplates);
  const tpl = templateId ? uploaded.find((t: TemplateItem) => t.id === templateId) : undefined;
  const pdfUrl = tpl ? `/uploads/templates/${tpl.id}.pdf` : undefined;

  // Store
  const markdown = useEditorStore(s => s.markdown);
  const markdownSource = useEditorStore(s => s.markdownSource);
  const parsing = useEditorStore(s => s.parsing);
  const saving = useEditorStore(s => s.saving);
  const saved = useEditorStore(s => s.saved);
  const resumeId = useEditorStore(s => s.resumeId);
  const setTemplate = useEditorStore(s => s.setTemplate);
  const setMarkdown = useEditorStore(s => s.setMarkdown);
  const setParsing = useEditorStore(s => s.setParsing);
  const setSaving = useEditorStore(s => s.setSaving);
  const setSaved = useEditorStore(s => s.setSaved);
  const setResumeId = useEditorStore(s => s.setResumeId);

  const [editing, setEditing] = useState(markdown);
  const [exporting, setExporting] = useState(false);
  const [contentList, setContentList] = useState<ContentItem[] | null>(null);
  const [previewPages, setPreviewPages] = useState<string[] | null>(null);
  const [prevMarkdown, setPrevMarkdown] = useState(markdown);
  if (markdown !== prevMarkdown) {
    setPrevMarkdown(markdown);
    setEditing(markdown);
  }

  useEffect(() => { setTemplate(templateId, pdfUrl); }, [templateId, pdfUrl, setTemplate]);

  // Upload → extract Markdown
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      setParsing(true);
      try {
        const md = await extractMarkdown(pdfUrl, tpl?.id ?? "").catch(() => ({ markdown:"", contentList:null, source:"pdfjs" as const }));
        if (!cancelled) { setMarkdown(md.markdown, md.source); if (md.contentList) setContentList(md.contentList); }
      } finally { if (!cancelled) setParsing(false); }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl, setMarkdown, setParsing, tpl?.id]);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true); setSaved(false);
    try {
      const data = { ...EMPTY, markdown: editing };
      if (resumeId) await updateResume(resumeId, data as ResumeData);
      else { const c = await createResume({ title: tpl?.name??"未命名", templateId: templateId??"classic", data: data as ResumeData }); setResumeId(c.id); }
      setSaved(true); setTimeout(() => setSaved(false), 2500); toast.success("已保存");
    } catch { toast.error("保存失败"); }
    finally { setSaving(false); }
  }, [resumeId, editing, templateId, tpl, setResumeId, setSaved, setSaving]);

  // Export
  const handleExport = useCallback(async () => {
    if (!editing.trim()) { toast.warning("没有内容"); return; }
    setExporting(true);
    try {
      const pages = await renderAllPages(editing, pdfUrl, contentList);
      if (!pages.length) { toast.error("生成失败"); return; }
      setPreviewPages(pages);
      toast.success("预览已生成");
    } catch { toast.error("导出失败"); }
    finally { setExporting(false); }
  }, [editing, pdfUrl]);

  const handleDownload = useCallback(async () => {
    if (!previewPages) return;
    await downloadPdf(previewPages, `${tpl?.name??"resume"}.pdf`);
  }, [previewPages, tpl]);

  return (
    <div className="h-dvh flex flex-col bg-background">
      <header className="shrink-0 flex items-center gap-3 border-b px-4 h-12">
        <Button variant="ghost" size="sm" asChild><Link href="/templates" className="gap-1.5"><ArrowLeft className="size-4" /><span className="hidden sm:inline">返回</span></Link></Button>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate flex-1"><FileText className="size-3.5 inline mr-1" />{tpl?.name??"简历编辑"}</span>
        {markdownSource && <span className="text-[10px] text-muted-foreground">{markdownSource==="mineru"?"MinerU":"本地提取"}</span>}
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving||parsing} className="gap-1.5">
          {saving?<><Loader2 className="size-3.5 animate-spin"/>保存中...</>:saved?<><Check className="size-3.5"/>已保存</>:<><Save className="size-3.5"/>保存</>}
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting||parsing} className="gap-1.5">
          {exporting?<><Loader2 className="size-3.5 animate-spin"/>生成中...</>:<>生成预览</>}
        </Button>
        <Button size="sm" onClick={handleDownload} disabled={!previewPages} className="gap-1.5"><Download className="size-3.5"/>下载 PDF</Button>
      </header>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
        {/* Left: PDF preview (auto-updating) */}
        <section className="overflow-auto bg-muted/30 flex flex-col border-r">
          {parsing ? (
            <div className="flex items-center justify-center flex-1 gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin"/><span className="text-xs">MinerU 提取中...</span></div>
          ) : previewPages ? (
            <div className="flex-1 overflow-auto p-4 flex flex-col items-center gap-4">
              {previewPages.map((url,i) => <div key={i} className="bg-white shadow-lg" style={{width:"210mm"}}><NextImage src={url} alt={`p${i+1}`} width={794} height={1123} unoptimized className="w-full h-auto" /></div>)}
            </div>
          ) : pdfUrl ? (
            <ClickablePdfView url={pdfUrl} modules={[]} activeModuleId={null} onModuleClick={()=>{}} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">请选择模版</div>
          )}
        </section>
        {/* Right: Editor */}
        <section className="flex flex-col min-h-0">
          <div className="shrink-0 px-4 py-2 border-b text-xs font-semibold text-muted-foreground flex items-center gap-2">
            Markdown 编辑器
            <span className="font-normal text-muted-foreground/60">（支持 Markdown 语法）</span>
          </div>
          <textarea
            value={editing}
            onChange={e => setEditing(e.target.value)}
            className="flex-1 w-full p-4 text-sm font-mono leading-relaxed resize-none border-0 bg-background focus:outline-none"
            placeholder={pdfUrl ? "MinerU 提取中..." : "请先选择模版..."}
          />
        </section>
      </div>
    </div>
  );
}
