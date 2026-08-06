"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRequest } from "ahooks";
import dynamic from "next/dynamic";
import { ArrowLeft, FileText, Loader2, Save, Download, Check, Trash2, Undo2, Sparkles, AlertCircle, Lightbulb, Target } from "lucide-react";
const ClickablePdfView = dynamic(() => import("@/components/preview/ClickablePdfView").then(m => m.ClickablePdfView), { ssr: false });
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getTemplates } from "@/lib/api/templates";
import { createResume, updateResume } from "@/lib/api/resume";
import type { TemplateItem } from "@/lib/api/templates";
import type { ResumeData } from "@/lib/validators/resume.schema";
import type { RichTextBlock } from "@/lib/pdf/text-extractor";
import { extractTextBlocks } from "@/lib/pdf/text-extractor";
import { useEditorStore } from "@/stores/editor-store";

const EMPTY: ResumeData = { basic: { name:"",email:"",phone:"",location:"",website:"",title:"" }, summary:"", education:[], experience:[], projects:[], skills:[], highlights:[], categorizedSkills: {} };

export function ResumeNewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template") ?? undefined;
  const source = searchParams.get("source") ?? undefined; // "analysis" 表示来自 AI 分析
  const { data: uploaded = [] } = useRequest(getTemplates);
  const tpl = templateId ? uploaded.find((t: TemplateItem) => t.id === templateId) : undefined;
  // 分析来源用 analysis 目录，模版用 templates 目录
  const pdfDir = source === "analysis" ? "api/analysis" : "api/templates";
  const pdfUrl = templateId ? `/${pdfDir}/${templateId}.pdf` : undefined;

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
  // AI analysis
  const aiAnalysis = useEditorStore(s => s.aiAnalysis);
  const setAiAnalysis = useEditorStore(s => s.setAiAnalysis);

  const [blocks, setBlocks] = useState<RichTextBlock[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [deletedBlocks, setDeletedBlocks] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [previewPages, setPreviewPages] = useState<string[] | null>(null);
  const [activePage, setActivePage] = useState<string>("template");
  const listRef = useRef<HTMLDivElement>(null);

  // Extract text blocks + MinerU 补充
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      setParsing(true);
      try {
        const b = await extractTextBlocks(pdfUrl);
        if (!cancelled && b.length) {
          setBlocks(b);
          setEdits({});
        }
      } catch (e) { console.error("文字块提取失败:", e); }
      finally { if (!cancelled) setParsing(false); }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl, source, templateId, setParsing]);

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

      const res = await fetch(`/api/templates/${templateId}/fill`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strayEdits,
          source,
          customPages: customPageList.map(p => ({ markdown: p.markdown })),
        }),
      });
      if (!res.ok) { toast.error("生成失败"); return; }
      const { url } = await res.json() as { url: string };
      setPreviewPages([url]);
      toast.success("PDF 已生成");
    } catch { toast.error("导出失败"); }
    finally { setExporting(false); }
  }, [blocks, edits, deletedBlocks, templateId, source, customPages]);

  const handleDownload = useCallback(() => {
    if (!previewPages?.length) return;
    window.open(previewPages[0], "_blank");
  }, [previewPages]);

  return (
    <div className="h-dvh flex flex-col bg-background">
      <header className="shrink-0 flex items-center gap-3 border-b px-4 h-12">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5"><ArrowLeft className="size-4"/><span className="hidden sm:inline">返回</span></Button>
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
            <Button
              variant="ghost"
              onClick={() => setActivePage("template")}
              className={`shrink-0 gap-1 px-3 py-1.5 text-xs border-b-2 transition-colors h-auto rounded-none ${
                activePage === "template"
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="size-3" />
              第1页 (模版)
            </Button>
            {source === "analysis" && aiAnalysis && (
              <Button
                variant="ghost"
                onClick={() => setActivePage("ai-analysis")}
                className={`shrink-0 gap-1 px-3 py-1.5 text-xs border-b-2 transition-colors h-auto rounded-none ${
                  activePage === "ai-analysis"
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3" />
                AI 分析
                <span className="ml-1 px-1 rounded-full bg-primary/10 text-[10px]">{aiAnalysis.score}</span>
              </Button>
            )}
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleDelete(b.globalIndex)}
                        title={isDeleted ? "恢复" : "删除此块"}
                        className={`size-6 rounded transition-colors ${isDeleted ? "text-green-500 hover:bg-green-50" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                      >
                        {isDeleted ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                      </Button>
                    </div>
                    <Textarea
                      value={edits[b.globalIndex] ?? b.text}
                      onChange={e => setEdits(prev => ({ ...prev, [b.globalIndex]: e.target.value }))}
                      className="w-full text-xs resize-none border-0 bg-transparent focus:outline-none min-h-0"
                      rows={Math.max(1, Math.ceil(b.text.length / 40))}
                      disabled={isDeleted}
                    />
                  </div>
                )})}
              </div>
            </>
          ) : activePage === "ai-analysis" && aiAnalysis ? (
            <>
              <div className="shrink-0 px-4 py-2 border-b text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <Sparkles className="size-3" /> AI 分析结果
                <Button variant="ghost" size="sm" onClick={() => setAiAnalysis(null)} className="ml-auto text-[10px] text-muted-foreground hover:text-destructive h-auto py-0">
                  关闭
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-4">
                {/* 评分 + 概述 */}
                <div className="text-center py-2">
                  <div className={`inline-flex items-center justify-center size-20 rounded-full border-4 text-2xl font-bold ${
                    aiAnalysis.score >= 70 ? "border-green-400 text-green-600" :
                    aiAnalysis.score >= 50 ? "border-amber-400 text-amber-600" :
                    "border-red-400 text-red-600"
                  }`}>
                    {aiAnalysis.score}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{aiAnalysis.overview}</p>
                </div>

                {/* 优点 */}
                {aiAnalysis.strengths.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1"><Target className="size-3.5 text-green-500" />优点</h5>
                    <ul className="space-y-1">
                      {aiAnalysis.strengths.map((s, i) => (
                        <li key={i} className="text-xs pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-green-400">{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 不足 */}
                {aiAnalysis.weaknesses.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1"><AlertCircle className="size-3.5 text-amber-500" />需改进</h5>
                    <ul className="space-y-2">
                      {aiAnalysis.weaknesses.map((w, i) => (
                        <li key={i} className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 size-4 rounded-full bg-amber-200 text-[10px] flex items-center justify-center font-medium">{i + 1}</span>
                            <span className="flex-1">{w}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const res = await fetch("/api/ai/improve-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: aiAnalysis.resumeText ?? "", type: "weakness", target: w }) });
                                if (res.ok) { const { improved } = await res.json() as { improved: string }; navigator.clipboard.writeText(improved); toast.success("建议已复制"); } else toast.error("获取失败");
                              }}
                              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-200 hover:bg-amber-300 transition-colors h-auto"
                            >优化</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 建议 */}
                {aiAnalysis.suggestions.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1"><Lightbulb className="size-3.5 text-blue-500" />建议</h5>
                    <ul className="space-y-2">
                      {aiAnalysis.suggestions.map((s, i) => (
                        <li key={i} className="text-xs bg-blue-50 border border-blue-200 rounded p-2">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 size-4 rounded-full bg-blue-200 text-[10px] flex items-center justify-center font-medium">{i + 1}</span>
                            <span className="flex-1">{s}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const res = await fetch("/api/ai/improve-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: aiAnalysis.resumeText ?? "", type: "suggestion", target: s }) });
                                if (res.ok) { const { improved } = await res.json() as { improved: string }; navigator.clipboard.writeText(improved); toast.success("建议已复制"); } else toast.error("获取失败");
                              }}
                              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-200 hover:bg-blue-300 transition-colors h-auto"
                            >优化</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
