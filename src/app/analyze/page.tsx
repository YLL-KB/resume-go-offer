"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ResumeEditor, { type ResumeData } from "@/components/resume-editor";
import { AppHeader } from "@/components/ui/app-header";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Target,
  TrendingUp,
  Wand2,
  Download,
  FileDown,
  PenLine,
  FileUp,
  ArrowRight,
  Zap,
  ScanEye,
} from "lucide-react";

// ── 工具函数 ──
async function uploadAnalysisFile(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/ai/upload-resume", { method: "POST", body: fd });
  if (!res.ok) throw new Error("上传失败");
  return res.json() as Promise<{ id: string; url: string }>;
}

// ── PDF 文本提取 ──
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
      const sorted = [...lines.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, words]) => words.join(" ").trim())
        .filter(l => l.length > 0);
      texts.push(sorted.join("\n"));
    }
    return texts.join("\n\n");
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  if (ext === "doc") throw new Error("暂不支持旧版 .doc 格式，请转换为 .docx 后上传");
  return file.text();
}

// ── DOCX → HTML ──
async function docxToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

// ── 导出 Word ──
async function exportWord(result: AnalyzeResult | null, filename?: string) {
  if (!result) return;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
  const strengths = result.strengths.map(s => new Paragraph({ children: [new TextRun({ text: `✅ ${s}`, size: 22 })] }));
  const weaknesses = result.weaknesses.map(w => new Paragraph({ children: [new TextRun({ text: `⚠ ${w}`, size: 22 })] }));
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
  const a = document.createElement("a"); a.href = url;
  a.download = `简历分析报告-${filename ?? "unknown"}.docx`; a.click();
  URL.revokeObjectURL(url);
}

// ── 类型 ──
interface AnalyzeResult {
  overview: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  score: number;
}

// ── 动画预设 ──
const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: "easeOut" as const },
};

// ── 评分环 ──
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size / 2) * 0.7;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "stroke-emerald-500" : score >= 50 ? "stroke-amber-500" : "stroke-red-500";
  const bg = score >= 70 ? "bg-emerald-50 text-emerald-700" : score >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="size-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={cn(color, "transition-all duration-1000 ease-out")}
        />
      </svg>
      <span className={cn("absolute flex flex-col items-center rounded-full px-3 py-1", bg)}>
        <span className="text-2xl font-extrabold tabular-nums">{score}</span>
        <span className="text-[10px] font-medium opacity-70">分</span>
      </span>
    </div>
  );
}

// ── 分析中动画 ──
function AnalyzingState() {
  const steps = ["读取文件内容...", "AI 理解简历结构...", "评估竞争力...", "生成改进建议..."];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="mb-8"
      >
        <div className="relative size-20">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
          <ScanEye className="absolute inset-0 m-auto size-8 text-primary" />
        </div>
      </motion.div>
      <p className="text-lg font-semibold text-foreground">{steps[step]}</p>
      <p className="mt-1 text-sm text-muted-foreground">AI 正在仔细分析你的简历，请稍候...</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
export default function AnalyzePage() {
  const router = useRouter();
  const setAiAnalysis = useEditorStore(s => s.setAiAnalysis);
  const [resumeTemplateId, setResumeTemplateId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
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

  // ── 文件处理 ──
  const handleFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "doc", "txt"].includes(ext ?? "")) { setError("仅支持 PDF、Word (.docx)、纯文本 (.txt) 格式"); return; }
    if (f.size > 10 * 1024 * 1024) { setError("文件大小不能超过 10MB"); return; }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null); setDocxHtml(null); setFile(f); setError(""); setResult(null);
    setResumeData(null); setEditing(false); setImprovements({});
    if (ext === "pdf") {
      setFileUrl(URL.createObjectURL(f));
      uploadAnalysisFile(f).then(u => setResumeTemplateId(u.id)).catch(() => {});
    } else { setResumeTemplateId(null); }
    if (ext === "docx") {
      try { const html = await docxToHtml(f); setDocxHtml(html); } catch { setDocxHtml(null); }
    }
  }, [fileUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  // ── 分析 ──
  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true); setError("");
    try {
      let text = "";
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf" && resumeTemplateId) {
        try {
          const mdRes = await fetch(`/api/templates/${resumeTemplateId}/extract-markdown?source=analysis`);
          if (mdRes.ok) { const md = await mdRes.json() as { markdown?: string }; text = md.markdown ?? ""; }
        } catch { /* 降级 */ }
      }
      const clean = (s: string) => s.replace(/\\u0000/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      text = clean(text);
      if (!text || text.length < 80 || !/(姓名|电话|手机|邮箱|Email|求职|应聘)/i.test(text)) {
        const raw = await extractText(file);
        const fallback = clean(raw);
        if (fallback.length > text.length) text = fallback;
      }
      if (text.trim().length < 50) throw new Error("简历内容太短，请确认文件内容完整");

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch("/api/ai/analyze-resume", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }), signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));

      const data: AnalyzeResult & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "分析失败");
      setCachedText(text); setResult(data);

      // 拆模块
      const sectionText = clean(text).replace(/^#{1,3}\s/gm, "");
      const headers = ["个人简历","个人信息","基本信息","求职意向","专业技能","技术栈","技能","技术能力","工作经历","工作经验","实习经历","项目经历","项目经验","项目","教育背景","教育经历","学历","自我评价","个人评价","关于我","证书","获奖","语言能力"];
      const pattern = new RegExp(`(${headers.join("|")})[\\s：:]*`, "g");
      const parts = sectionText.split(pattern).filter(Boolean);
      const sections: { title: string; content: string }[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (headers.some(h => parts[i].trim().startsWith(h))) { sections.push({ title: parts[i].trim(), content: (parts[i + 1] ?? "").trim() }); i++; }
      }
      if (parts.length > 0 && sections.length === 0) sections.push({ title: "简历内容", content: parts.join("").trim() });
      setAiAnalysis({ ...data, resumeText: text, parsedSections: sections });
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally { setLoading(false); }
  };

  // ── AI 优化单条 ──
  const handleImprove = async (target: string, type: "weakness" | "suggestion") => {
    if (!file || improving) return;
    setImproving(target);
    try {
      const text = cachedText ?? (await extractText(file));
      const res = await fetch("/api/ai/improve-resume", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, type, target }),
      });
      const data: { error?: string; improved?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "优化失败");
      setImprovements(prev => ({ ...prev, [target]: data.improved ?? "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "优化失败");
    } finally { setImproving(null); }
  };

  // ── 解析为表单 ──
  const handleParse = async () => {
    if (!cachedText) return;
    try {
      setParsing(true); setError("");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch("/api/ai/parse-resume", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: cachedText }), signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      const data: ResumeData & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      setResumeData(data); setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally { setParsing(false); }
  };

  // ═══════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* ═══ 页面标题 ═══ */}
        <motion.div className="mb-8 text-center" {...fadeSlide}>
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-primary/10 ring-1 ring-primary/10">
            <ScanEye className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            AI 简历分析
          </h1>
          <p className="mt-2 text-muted-foreground">
            上传简历，AI 从 HR 视角评估竞争力并给出具体改进方案
          </p>
        </motion.div>

        {/* ═══ 内容区：左上传 + 右结果 ═══ */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* ── 左栏 ── */}
          <div className="w-full lg:w-[460px] xl:w-[520px] shrink-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div>
              {!file ? (
                // ═══ 上传区 ═══
                <motion.div key="upload" {...fadeSlide}>
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 cursor-pointer min-h-[420px] flex flex-col items-center justify-center",
                      dragOver
                        ? "border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10"
                        : "border-border hover:border-primary/40 hover:bg-muted/30",
                    )}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById("file-input")?.click()}
                  >
                    {/* 背景装饰 */}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--primary)/.06,transparent_70%)]" />

                    <div className="relative space-y-4">
                      <motion.div
                        animate={dragOver ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}
                        className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10"
                      >
                        <Upload className="size-7 text-primary" />
                      </motion.div>
                      <div>
                        <p className="text-base font-semibold">
                          {dragOver ? "松开即可上传" : "拖拽简历到此处"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">或点击选择文件</p>
                      </div>
                      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground/70">
                        <Badge variant="secondary" className="font-normal">PDF</Badge>
                        <Badge variant="secondary" className="font-normal">Word</Badge>
                        <Badge variant="secondary" className="font-normal">TXT</Badge>
                        <span className="tabular-nums">≤ 10MB</span>
                      </div>
                    </div>
                    <input id="file-input" type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  </div>
                </motion.div>
              ) : (
                // ═══ 已选文件卡片 ═══
                <motion.div key="file-card" {...fadeSlide}>
                  <Card className="overflow-hidden border-border/60 shadow-sm">
                    <CardContent className="p-0">
                      {/* 文件信息行 */}
                      <div className="flex items-center gap-3 p-4">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-violet-500/10">
                          <FileText className="size-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB · {fileExt?.toUpperCase()}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setFile(null); setResult(null); setError(""); setResumeData(null); setEditing(false); setImprovements({}); setDocxHtml(null); }}>
                          更换
                        </Button>
                      </div>
                      {/* 操作按钮 */}
                      <div className="flex gap-2 border-t p-3">
                        <Button onClick={handleAnalyze} disabled={loading} className="flex-1 h-10 shadow-sm shadow-primary/20">
                          {loading ? (
                            <><Loader2 className="mr-2 size-4 animate-spin" />分析中...</>
                          ) : (
                            <><Sparkles className="mr-2 size-4" />AI 分析简历</>
                          )}
                        </Button>
                        {cachedText && result && resumeTemplateId && (
                          <Button variant="secondary" size="sm" onClick={() => router.push(`/resume/edit?template=${resumeTemplateId}&source=analysis`)}>
                            <PenLine className="mr-1 size-4" />编辑
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>

            {/* 错误提示 */}
            <div>
              {error && (
                <motion.div {...fadeSlide}>
                  <Card className="border-destructive/40 bg-destructive/5">
                    <CardContent className="flex items-center gap-2.5 p-3.5 text-sm text-destructive">
                      <AlertCircle className="size-4 shrink-0" />{error}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>

            {/* PDF / DOCX 预览 */}
            <div>
              {file && (
                <motion.div {...fadeSlide} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  {fileExt === "pdf" && fileUrl && (
                    <embed src={fileUrl} type="application/pdf" className="w-full h-[500px] lg:h-[600px]" />
                  )}
                  {fileExt === "docx" && docxHtml && (
                    <div className="p-5 overflow-auto max-h-[500px]">
                      <div className="prose prose-sm max-w-none [&_table]:border [&_td]:border [&_th]:border [&_td]:p-1.5 [&_th]:p-1.5" dangerouslySetInnerHTML={{ __html: docxHtml }} />
                    </div>
                  )}
                  {fileExt === "txt" && (
                    <div className="p-5 overflow-auto max-h-[500px]">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">文本预览</p>
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">{cachedText || "正在读取..."}</pre>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* 表单编辑器 */}
            {editing && resumeData && (
              <ResumeEditor
                data={resumeData} loading={loading} filename={file?.name}
                onChange={setResumeData}
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
                onCancel={() => { setEditing(false); setResumeData(null); }}
              />
            )}
          </div>

          {/* ═══ 右栏：分析结果 ═══ */}
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              {loading ? (
                // 分析中
                <motion.div key="loading" {...fadeSlide}>
                  <Card className="border-border/40 min-h-[420px] flex">
                    <CardContent className="flex flex-col items-center justify-center flex-1"><AnalyzingState /></CardContent>
                  </Card>
                </motion.div>
              ) : result ? (
                // 有结果
                <motion.div key="result" {...fadeSlide} className="space-y-4">
                  {/* 工具栏 */}
                  <Card className="border-border/40 shadow-sm">
                    <CardContent className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" />
                        <h3 className="font-semibold text-sm">分析报告</h3>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-xs">
                          <Download className="mr-1 size-3" />导出 PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportWord(result, file?.name)} className="h-8 text-xs">
                          <FileDown className="mr-1 size-3" />导出 Word
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 评分卡片 */}
                  <Card className="border-border/40 shadow-sm overflow-hidden">
                    <CardContent className="flex items-center gap-6 p-5">
                      <ScoreRing score={result.score} size={110} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg">综合评分</h3>
                          {result.score >= 70 ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[11px]">优秀</Badge>
                          ) : result.score >= 50 ? (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[11px]">良好</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[11px]">需改进</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{result.overview}</p>
                        {/* 快速操作 */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {cachedText && !editing && (
                            <Button variant="secondary" size="sm" onClick={handleParse} disabled={parsing} className="h-8 text-xs">
                              {parsing ? <><Loader2 className="mr-1 size-3 animate-spin" />解析中</> : <><FileUp className="mr-1 size-3" />结构化编辑</>}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 亮点 + 不足 双栏 */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* 亮点 */}
                    <Card className="border-emerald-200/60 bg-emerald-50/30 dark:bg-emerald-950/10 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                            <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <h4 className="font-semibold text-sm text-emerald-700 dark:text-emerald-300">亮点</h4>
                          <Badge variant="secondary" className="ml-auto text-[10px]">{result.strengths.length} 项</Badge>
                        </div>
                        <ul className="space-y-2">
                          {result.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    {/* 不足 */}
                    <Card className="border-red-200/60 bg-red-50/20 dark:bg-red-950/10 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                            <Target className="size-3.5 text-red-500 dark:text-red-400" />
                          </div>
                          <h4 className="font-semibold text-sm text-red-700 dark:text-red-300">需要改进</h4>
                          <Badge variant="secondary" className="ml-auto text-[10px]">{result.weaknesses.length} 项</Badge>
                        </div>
                        <ul className="space-y-3">
                          {result.weaknesses.map((w, i) => (
                            <li key={i} className="group">
                              <div className="flex items-start gap-2 text-sm leading-relaxed">
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                                <span className="flex-1">{w}</span>
                                <button
                                  onClick={() => handleImprove(w, "weakness")}
                                  disabled={improving === w}
                                  className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 disabled:opacity-100"
                                >
                                  {improving === w ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                                </button>
                              </div>
                              <div>
                                {improvements[w] && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                                    className="ml-5 mt-2 overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
                                    <div className="mb-1.5 flex items-center gap-1 text-primary font-medium">
                                      <Sparkles className="size-3" />AI 优化建议
                                      <button onClick={() => { const n = { ...improvements }; delete n[w]; setImprovements(n); }}
                                        className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
                                    </div>
                                    {improvements[w].split("\n").map((line, j) => <p key={j} className="mb-1 last:mb-0">{line}</p>)}
                                  </motion.div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 改进建议 */}
                  <Card className="border-border/40 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                          <Lightbulb className="size-3.5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h4 className="font-semibold text-sm">改进建议</h4>
                        <Badge variant="secondary" className="ml-auto text-[10px]">{result.suggestions.length} 条</Badge>
                      </div>
                      <ul className="space-y-3">
                        {result.suggestions.map((s, i) => (
                          <li key={i} className="group">
                            <div className="flex items-start gap-3 text-sm leading-relaxed">
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
                              <span className="flex-1 pt-0.5">{s}</span>
                              <button
                                onClick={() => handleImprove(s, "suggestion")}
                                disabled={improving === s}
                                className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-primary/10 hover:text-primary group-hover:opacity-100 disabled:opacity-100"
                              >
                                {improving === s ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                              </button>
                            </div>
                            <div>
                              {improvements[s] && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                                  className="ml-9 mt-2 overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
                                  <div className="mb-1.5 flex items-center gap-1 text-primary font-medium">
                                    <Sparkles className="size-3" />AI 优化建议
                                    <button onClick={() => { const n = { ...improvements }; delete n[s]; setImprovements(n); }}
                                      className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
                                  </div>
                                  {improvements[s].split("\n").map((line, j) => <p key={j} className="mb-1 last:mb-0">{line}</p>)}
                                </motion.div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                // 空状态
                <motion.div key="empty" {...fadeSlide}>
                  <Card className="border-border/40 shadow-sm min-h-[420px] flex">
                    <CardContent className="flex flex-col items-center justify-center flex-1 text-center">
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                        className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted"
                      >
                        <FileUp className="size-7 text-muted-foreground/40" />
                      </motion.div>
                      <h3 className="text-lg font-semibold text-muted-foreground">等待分析</h3>
                      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground/70">
                        上传简历文件后，AI 将从 HR 视角全面评估你的简历竞争力
                      </p>
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
        </div>
      </main>
    </div>
  );
}
