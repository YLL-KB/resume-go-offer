"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ResumeEditor, { type ResumeData } from "@/components/resume-editor";
import { AppHeader } from "@/components/ui/app-header";
import { UploadZone } from "@/components/analyze/UploadZone";
import { AnalyzingState } from "@/components/analyze/AnalyzingState";
import { ResultView } from "@/components/analyze/ResultView";
import {
  FileText, Sparkles, Loader2, AlertCircle, FileUp,
  ScanEye, PenLine, CheckCircle2, Target, Wand2,
} from "lucide-react";

// ── 工具函数 ──
async function uploadAnalysisFile(file: File) {
  const fd = new FormData(); fd.append("file", file);
  const res = await fetch("/api/ai/upload-resume", { method: "POST", body: fd });
  if (!res.ok) throw new Error("上传失败");
  return res.json() as Promise<{ id: string; url: string }>;
}

async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.mjs?v=${pdfjs.version}`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = new Map<number, string[]>();
      for (const item of content.items) {
        const str = ("str" in item ? item.str : "").trim();
        if (!str) continue;
        const y = Math.round("transform" in item ? (item.transform as number[])[5] : 0);
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y)!.push(str);
      }
      const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, words]) => words.join(" ").trim()).filter((l) => l.length > 0);
      texts.push(sorted.join("\n"));
    }
    return texts.join("\n\n");
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  if (ext === "doc") throw new Error("暂不支持旧版 .doc 格式，请转换为 .docx 后上传");
  return file.text();
}

async function docxToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

async function exportWord(result: AnalyzeResult | null, filename?: string) {
  if (!result) return;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
  const strengths = result.strengths.map((s) => new Paragraph({ children: [new TextRun({ text: `✅ ${s}`, size: 22 })] }));
  const weaknesses = result.weaknesses.map((w) => new Paragraph({ children: [new TextRun({ text: `⚠ ${w}`, size: 22 })] }));
  const suggestions = result.suggestions.map((s, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${s}`, size: 22 })] }));
  const doc = new Document({
    title: "简历分析报告",
    sections: [{
      children: [
        new Paragraph({ text: "简历分析报告", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        ...(filename ? [new Paragraph({ children: [new TextRun({ text: `文件：${filename}`, size: 22, color: "666666" })] })] : []),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        new Paragraph({ text: `综合评分：${result.score}/100`, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: result.overview, size: 22 })] }),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        new Paragraph({ text: "📈 亮点", heading: HeadingLevel.HEADING_2 }), ...strengths,
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        new Paragraph({ text: "🎯 需要改进", heading: HeadingLevel.HEADING_2 }), ...weaknesses,
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        new Paragraph({ text: "💡 改进建议", heading: HeadingLevel.HEADING_2 }), ...suggestions,
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `简历分析报告-${filename ?? "unknown"}.docx`; a.click();
  URL.revokeObjectURL(url);
}

interface AnalyzeResult { overview: string; strengths: string[]; weaknesses: string[]; suggestions: string[]; score: number; }

const fadeSlide = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" as const } };

const cleanText = (s: string) => s.replace(/\\u0000/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export default function AnalyzePage() {
  const router = useRouter();
  const setAiAnalysis = useEditorStore((s) => s.setAiAnalysis);
  const [resumeTemplateId, setResumeTemplateId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState("");
  const [improving, setImproving] = useState<string | null>(null);
  const [improvements, setImprovements] = useState<Record<string, string>>({});
  const [cachedText, setCachedText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const fileUrlCleanupRef = useRef<string | null>(null);
  const fileExt = file ? file.name.split(".").pop()?.toLowerCase() : "";

  useEffect(() => { fileUrlCleanupRef.current = fileUrl; }, [fileUrl]);
  useEffect(() => () => { if (fileUrlCleanupRef.current) URL.revokeObjectURL(fileUrlCleanupRef.current); }, []);

  const handleFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "doc", "txt"].includes(ext ?? "")) { setError("仅支持 PDF、Word (.docx)、纯文本 (.txt) 格式"); return; }
    if (f.size > 10 * 1024 * 1024) { setError("文件大小不能超过 10MB"); return; }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null); setDocxHtml(null); setFile(f); setError(""); setResult(null);
    setResumeData(null); setEditing(false); setImprovements({});
    if (ext === "pdf") { setFileUrl(URL.createObjectURL(f)); uploadAnalysisFile(f).then((u) => setResumeTemplateId(u.id)).catch(() => {}); }
    else setResumeTemplateId(null);
    if (ext === "docx") { try { setDocxHtml(await docxToHtml(f)); } catch { setDocxHtml(null); } }
  }, [fileUrl]);

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true); setError("");
    try {
      let text = "";
      if (file.name.endsWith(".pdf") && resumeTemplateId) {
        try {
          const mdRes = await fetch(`/api/templates/${resumeTemplateId}/extract-markdown?source=analysis`);
          if (mdRes.ok) { const md = await mdRes.json() as { markdown?: string }; text = md.markdown ?? ""; }
        } catch { /* fallback */ }
      }
      text = cleanText(text);
      if (!text || text.length < 80 || !/(姓名|电话|手机|邮箱|Email|求职|应聘)/i.test(text)) {
        const raw = await extractText(file);
        const fallback = cleanText(raw);
        if (fallback.length > text.length) text = fallback;
      }
      if (text.trim().length < 50) throw new Error("简历内容太短，请确认文件内容完整");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch("/api/ai/analyze-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }), signal: ctrl.signal }).finally(() => clearTimeout(timer));
      const data: AnalyzeResult & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "分析失败");
      setCachedText(text); setResult(data);
      const sectionText = cleanText(text).replace(/^#{1,3}\s/gm, "");
      const headers = ["个人简历","个人信息","基本信息","求职意向","专业技能","技术栈","技能","技术能力","工作经历","工作经验","实习经历","项目经历","项目经验","项目","教育背景","教育经历","学历","自我评价","个人评价","关于我","证书","获奖","语言能力"];
      const pattern = new RegExp(`(${headers.join("|")})[\\s：:]*`, "g");
      const parts = sectionText.split(pattern).filter(Boolean);
      const sections: { title: string; content: string }[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (headers.some((h) => parts[i].trim().startsWith(h))) { sections.push({ title: parts[i].trim(), content: (parts[i + 1] ?? "").trim() }); i++; }
      }
      if (parts.length > 0 && sections.length === 0) sections.push({ title: "简历内容", content: parts.join("").trim() });
      setAiAnalysis({ ...data, resumeText: text, parsedSections: sections });
    } catch (err) { setError(err instanceof Error ? err.message : "分析失败"); }
    finally { setLoading(false); }
  };

  const handleImprove = async (target: string, type: "weakness" | "suggestion") => {
    if (!file || improving) return;
    setImproving(target);
    try {
      const text = cachedText ?? (await extractText(file));
      const res = await fetch("/api/ai/improve-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, type, target }) });
      const data: { error?: string; improved?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "优化失败");
      setImprovements((prev) => ({ ...prev, [target]: data.improved ?? "" }));
    } catch (err) { setError(err instanceof Error ? err.message : "优化失败"); }
    finally { setImproving(null); }
  };

  const handleParse = async () => {
    if (!cachedText) return;
    try {
      setParsing(true); setError("");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch("/api/ai/parse-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: cachedText }), signal: ctrl.signal }).finally(() => clearTimeout(timer));
      const data: ResumeData & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      setResumeData(data); setEditing(true);
    } catch (err) { setError(err instanceof Error ? err.message : "解析失败"); }
    finally { setParsing(false); }
  };

  const resetFile = () => { setFile(null); setResult(null); setError(""); setResumeData(null); setEditing(false); setImprovements({}); setDocxHtml(null); };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <motion.div className="mb-8 text-center" {...fadeSlide}>
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-primary/10 ring-1 ring-primary/10">
            <ScanEye className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AI 简历分析</h1>
          <p className="mt-2 text-muted-foreground">上传简历，AI 从 HR 视角评估竞争力并给出具体改进方案</p>
        </motion.div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="w-full lg:w-[460px] xl:w-[520px] shrink-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            {!file ? <UploadZone onFile={handleFile} /> : (
              <motion.div key="file-card" {...fadeSlide}>
                <Card className="overflow-hidden border-border/60 shadow-sm">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-3 p-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-violet-500/10"><FileText className="size-5 text-primary" /></div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {fileExt?.toUpperCase()}</p></div>
                      <Button variant="ghost" size="sm" onClick={resetFile}>更换</Button>
                    </div>
                    <div className="flex gap-2 border-t p-3">
                      <Button onClick={handleAnalyze} disabled={loading} className="flex-1 h-10 shadow-sm shadow-primary/20">
                        {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />分析中...</> : <><Sparkles className="mr-2 size-4" />AI 分析简历</>}
                      </Button>
                      {cachedText && result && resumeTemplateId && (
                        <Button variant="secondary" size="sm" onClick={() => router.push(`/resume/edit?template=${resumeTemplateId}&source=analysis`)}><PenLine className="mr-1 size-4" />编辑</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {error && (
              <motion.div {...fadeSlide}>
                <Card className="border-destructive/40 bg-destructive/5"><CardContent className="flex items-center gap-2.5 p-3.5 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />{error}</CardContent></Card>
              </motion.div>
            )}

            {file && (
              <motion.div {...fadeSlide} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                {fileExt === "pdf" && fileUrl && <embed src={fileUrl} type="application/pdf" className="w-full h-[500px] lg:h-[600px]" />}
                {fileExt === "docx" && docxHtml && <div className="p-5 overflow-auto max-h-[500px]"><div className="prose prose-sm max-w-none [&_table]:border [&_td]:border [&_th]:border [&_td]:p-1.5 [&_th]:p-1.5" dangerouslySetInnerHTML={{ __html: docxHtml }} /></div>}
                {fileExt === "txt" && <div className="p-5 overflow-auto max-h-[500px]"><p className="text-xs text-muted-foreground mb-2 font-medium">文本预览</p><pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">{cachedText || "正在读取..."}</pre></div>}
              </motion.div>
            )}

            {editing && resumeData && (
              <ResumeEditor data={resumeData} loading={loading} filename={file?.name} onChange={setResumeData}
                onReAnalyze={async (text) => {
                  if (!text.trim()) return; setLoading(true); setError("");
                  try {
                    const res = await fetch("/api/ai/analyze-resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) });
                    const data: AnalyzeResult & { error?: string } = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "分析失败");
                    setResult(data); setCachedText(text); setAiAnalysis({ ...data, resumeText: text });
                  } catch (err) { setError(err instanceof Error ? err.message : "分析失败"); }
                  finally { setLoading(false); }
                }}
                onCancel={() => { setEditing(false); setResumeData(null); }} />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            {loading ? (
              <motion.div key="loading" {...fadeSlide}><Card className="border-border/40 min-h-[420px] flex"><CardContent className="flex flex-col items-center justify-center flex-1"><AnalyzingState /></CardContent></Card></motion.div>
            ) : result ? (
              <ResultView result={result} improving={improving} improvements={improvements} onImprove={handleImprove} onParse={handleParse} onExportWord={() => exportWord(result, file?.name)} parsing={parsing} editing={editing} />
            ) : (
              <motion.div key="empty" {...fadeSlide}>
                <Card className="border-border/40 shadow-sm min-h-[420px] flex">
                  <CardContent className="flex flex-col items-center justify-center flex-1 text-center">
                    <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted"><FileUp className="size-7 text-muted-foreground/40" /></motion.div>
                    <h3 className="text-lg font-semibold text-muted-foreground">等待分析</h3>
                    <p className="mt-1.5 max-w-xs text-sm text-muted-foreground/70">上传简历文件后，AI 将从 HR 视角全面评估你的简历竞争力</p>
                    <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground/50">
                      <span className="flex items-center gap-1"><CheckCircle2 className="size-3" />竞争力评分</span>
                      <span className="flex items-center gap-1"><Target className="size-3" />问题诊断</span>
                      <span className="flex items-center gap-1"><Wand2 className="size-3" />改进建议</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
