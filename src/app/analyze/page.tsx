"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ResumeEditor, { type ResumeData } from "@/components/resume-editor";
import {
  Upload,
  FileText,
  ArrowLeft,
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
} from "lucide-react";

// ============================================================
// 文本提取
// ============================================================
async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texts.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
    }
    return texts.join("\n");
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  if (ext === "doc") {
    throw new Error("暂不支持旧版 .doc 格式，请转换为 .docx 后上传");
  }

  return file.text();
}

// ============================================================
// DOCX → HTML 预览（将 mammoth 的 HTML 转成可用于显示的 vnode）
// ============================================================
async function docxToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

// ============================================================
// 导出 PDF（使用 print 策略，零依赖、保留样式）
// ============================================================
function exportPDF() {
  window.print();
}

// ============================================================
// 导出 Word（使用 docx 库）
// ============================================================
async function exportWord(result: AnalyzeResult | null, filename?: string) {
  if (!result) return;
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
  } = await import("docx");

  const strengths = result.strengths.map(
    (s) =>
      new Paragraph({ children: [new TextRun({ text: `✅ ${s}`, size: 22 })] }),
  );
  const weaknesses = result.weaknesses.map(
    (w) =>
      new Paragraph({ children: [new TextRun({ text: `⚠ ${w}`, size: 22 })] }),
  );
  const suggestions = result.suggestions.map(
    (s, i) =>
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${s}`, size: 22 })],
      }),
  );

  const doc = new Document({
    title: "简历分析报告",
    description: `对 ${filename ?? "简历"} 的 AI 分析报告`,
    sections: [
      {
        children: [
          new Paragraph({
            text: "简历分析报告",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ spacing: { after: 200 }, children: [] }),
          ...(filename
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `文件：${filename}`,
                      size: 22,
                      color: "666666",
                    }),
                  ],
                }),
              ]
            : []),
          new Paragraph({ spacing: { after: 200 }, children: [] }),
          new Paragraph({
            text: `综合评分：${result.score}/100`,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [new TextRun({ text: result.overview, size: 22 })],
          }),
          new Paragraph({ spacing: { after: 200 }, children: [] }),

          new Paragraph({ text: "📈 亮点", heading: HeadingLevel.HEADING_2 }),
          ...strengths,
          new Paragraph({ spacing: { after: 200 }, children: [] }),

          new Paragraph({
            text: "🎯 需要改进",
            heading: HeadingLevel.HEADING_2,
          }),
          ...weaknesses,
          new Paragraph({ spacing: { after: 200 }, children: [] }),

          new Paragraph({
            text: "💡 改进建议",
            heading: HeadingLevel.HEADING_2,
          }),
          ...suggestions,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `简历分析报告-${filename ?? "unknown"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// AI 分析结果类型
// ============================================================
interface AnalyzeResult {
  overview: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  score: number;
}

// ============================================================
// 页面组件
// ============================================================
export default function AnalyzePage() {
  const router = useRouter();
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
  const fileUrlCleanupRef = useRef<string | null>(null); // 仅用于 cleanup，不在 render 中访问
  const analysisRef = useRef<HTMLDivElement | null>(null);
  const fileExt = file ? file.name.split(".").pop()?.toLowerCase() : "";

  // 同步 cleanup ref（不在 render 中访问 ref）
  useEffect(() => {
    fileUrlCleanupRef.current = fileUrl;
  }, [fileUrl]);

  // 清理 object URL
  useEffect(() => {
    return () => {
      if (fileUrlCleanupRef.current) URL.revokeObjectURL(fileUrlCleanupRef.current);
    };
  }, []);

  const handleFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "doc", "txt"].includes(ext ?? "")) {
      setError("仅支持 PDF、Word (.docx)、纯文本 (.txt) 格式");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("文件大小不能超过 10MB");
      return;
    }
    // 清理旧数据
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setDocxHtml(null);
    setFile(f);
    setError("");
    setResult(null);
    setResumeData(null);
    setEditing(false);
    setImprovements({});

    // 为 PDF 生成 object URL
    if (ext === "pdf") {
      setFileUrl(URL.createObjectURL(f));
    }

    // 为 DOCX 生成 HTML 预览
    if (ext === "docx") {
      try {
        const html = await docxToHtml(f);
        setDocxHtml(html);
      } catch {
        setDocxHtml(null);
      }
    }
  }, [fileUrl]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const text = await extractText(file);
      if (text.trim().length < 50) {
        throw new Error("简历内容太短，请确认文件内容完整");
      }

      const res = await fetch("/api/ai/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      const data: AnalyzeResult & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "分析失败");
      setCachedText(text);
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "分析失败";
      console.error("[分析出错]", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleImprove = async (
    target: string,
    type: "weakness" | "suggestion",
  ) => {
    if (!file || improving) return;
    setImproving(target);
    try {
      const text = cachedText ?? (await extractText(file));

      const res = await fetch("/api/ai/improve-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, type, target }),
      });

      const data: { error?: string; improved?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "优化失败");
      setImprovements((prev) => ({ ...prev, [target]: data.improved ?? "" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "优化失败";
      console.error("[优化出错]", err);
      setError(msg);
    } finally {
      setImproving(null);
    }
  };

  const handleParse = async () => {
    if (!cachedText) return;
    try {
      setParsing(true);
      setError("");
      const res = await fetch("/api/ai/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: cachedText }),
      });
      const data: ResumeData & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      setResumeData(data);
      setEditing(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "解析失败";
      console.error("[解析出错]", err);
      setError(msg);
    } finally {
      setParsing(false);
    }
  };

  const renderScoreCircle = (score: number) => (
    <div className="relative flex size-20 shrink-0 items-center justify-center">
      <svg className="size-20 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/30"
        />
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke={
            score >= 70
              ? "oklch(0.546 0.245 262.881)"
              : score >= 50
                ? "oklch(0.7 0.15 80)"
                : "oklch(0.577 0.245 27.325)"
          }
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${score * 2.14} 214`}
        />
      </svg>
      <span className="absolute text-xl font-bold">{score}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            返回
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-lg"
          >
            <FileText className="size-5 text-primary" />
            Resume Go Offer
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold sm:text-3xl">AI 简历分析</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              上传简历 → AI 分析 → 获得改进建议
            </p>
          </div>

          {/* 两栏布局 */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* ========== 左栏：文件上传 + 文件预览 ========== */}
            <div className="w-full lg:w-[480px] xl:w-[540px] shrink-0 space-y-4">
              {/* 上传区域 */}
              {!file ? (
                <div
                  className={`
                    relative rounded-xl border-2 border-dashed p-8 text-center transition-colors
                    ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
                  `}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <div className="space-y-3">
                    <Upload className="mx-auto size-8 text-muted-foreground" />
                    <p className="font-medium">拖拽简历到此处，或点击选择</p>
                    <p className="text-xs text-muted-foreground">
                      支持 PDF / Word / TXT，最大 10MB
                    </p>
                    <label>
                      <Button variant="outline" asChild>
                        <span>选择文件</span>
                      </Button>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(f);
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                // 已选择文件 — 文件信息 + 操作按钮
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFile(null);
                          setResult(null);
                          setError("");
                          setResumeData(null);
                          setEditing(false);
                          setImprovements({});
                          setDocxHtml(null);
                        }}
                      >
                        更换
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAnalyze}
                        disabled={loading}
                        className="flex-1"
                      >
                        {loading ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 size-4" />
                        )}
                        {loading ? "分析中..." : "开始分析"}
                      </Button>
                      {cachedText && !editing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleParse}
                          disabled={parsing}
                        >
                          {parsing ? (
                            <Loader2 className="mr-1 size-4 animate-spin" />
                          ) : null}
                          {parsing ? "解析中..." : "编辑简历"}
                        </Button>
                      )}
                      {editing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(false);
                            setResumeData(null);
                          }}
                        >
                          取消编辑
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {error && (
                <Card className="border-destructive/50 bg-destructive/5">
                  <CardContent className="flex items-center gap-2 p-3 text-sm text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    {error}
                  </CardContent>
                </Card>
              )}

              {/* 文件预览区 */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 className="size-8 animate-spin" />
                  <p className="text-sm">AI 正在分析你的简历...</p>
                </div>
              )}

              {!loading && file && (
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  {/* PDF 预览：直接嵌入 */}
                  {fileExt === "pdf" && fileUrl && (
                    <embed
                      src={fileUrl}
                      type="application/pdf"
                      className="w-full min-h-[500px]"
                    />
                  )}

                  {/* DOCX 预览：mammoth 转 HTML */}
                  {fileExt === "docx" && docxHtml && (
                    <div className="p-6 overflow-auto max-h-[600px]">
                      <div
                        className="prose prose-sm max-w-none [&_table]:border [&_td]:border [&_th]:border [&_td]:p-2 [&_th]:p-2"
                        dangerouslySetInnerHTML={{ __html: docxHtml }}
                      />
                    </div>
                  )}

                  {/* TXT 预览（或 docx 没有 HTML 时的 fallback） */}
                  {fileExt === "txt" && (
                    <div className="p-6 overflow-auto max-h-[600px]">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">
                        文本预览
                      </p>
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
                        {cachedText || "正在读取文件..."}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* 在线编辑简历（表单模式） */}
              {editing && resumeData && (
                <ResumeEditor
                  data={resumeData}
                  loading={loading}
                  filename={file?.name}
                  onChange={setResumeData}
                  onReAnalyze={async (text) => {
                    if (!text.trim()) return;
                    setLoading(true);
                    setError("");
                    try {
                      const res = await fetch("/api/ai/analyze-resume", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ content: text }),
                      });
                      const data: AnalyzeResult & { error?: string } =
                        await res.json();
                      if (!res.ok) throw new Error(data.error ?? "分析失败");
                      setResult(data);
                      setCachedText(text);
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : "分析失败";
                      console.error("[重新分析出错]", err);
                      setError(msg);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  onCancel={() => {
                    setEditing(false);
                    setResumeData(null);
                  }}
                />
              )}
            </div>

            {/* ========== 右栏：分析结果 ========== */}
            <div ref={analysisRef} className="flex-1 min-w-0 space-y-4">
              {!result && !loading && (
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                  <FileText className="size-12 mb-3 opacity-30" />
                  <p className="text-lg font-medium">上传简历开始分析</p>
                  <p className="text-sm mt-1">
                    AI 将评估你的简历并给出改进建议
                  </p>
                </div>
              )}

              {result && (
                <>
                  {/* 导出按钮组 */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm">分析报告</h3>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={exportPDF}
                          >
                            <Download className="mr-1 size-3.5" />
                            导出 PDF
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportWord(result, file?.name)}
                          >
                            <FileDown className="mr-1 size-3.5" />
                            导出 Word
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 评分 */}
                  <Card>
                    <CardContent className="flex items-center gap-4 p-5">
                      {renderScoreCircle(result.score)}
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base">综合评分</h3>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-3">
                          {result.overview}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 亮点 + 不足 */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="border-green-200 dark:border-green-800">
                      <CardContent className="p-4">
                        <h4 className="flex items-center gap-2 font-semibold text-green-600 dark:text-green-400 mb-3 text-sm">
                          <TrendingUp className="size-4" />
                          亮点
                        </h4>
                        <ul className="space-y-2">
                          {result.strengths.map((s, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm"
                            >
                              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-500" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    <Card className="border-red-200 dark:border-red-800">
                      <CardContent className="p-4">
                        <h4 className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400 mb-3 text-sm">
                          <Target className="size-4" />
                          需要改进
                        </h4>
                        <ul className="space-y-3">
                          {result.weaknesses.map((w, i) => (
                            <li key={i} className="group">
                              <div className="flex items-start gap-2 text-sm">
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                                <span className="flex-1">{w}</span>
                                <button
                                  onClick={() => handleImprove(w, "weakness")}
                                  disabled={improving === w}
                                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 disabled:opacity-100"
                                  title="AI 优化"
                                >
                                  {improving === w ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Wand2 className="size-4" />
                                  )}
                                </button>
                              </div>
                              {improvements[w] && (
                                <motion.div
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="ml-5 mt-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground/80"
                                >
                                  <div className="mb-1 flex items-center gap-1 text-primary">
                                    <Sparkles className="size-3" />
                                    <span className="font-medium">
                                      AI 优化建议
                                    </span>
                                    <button
                                      onClick={() => {
                                        const next = { ...improvements };
                                        delete next[w];
                                        setImprovements(next);
                                      }}
                                      className="ml-auto text-muted-foreground hover:text-foreground"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {improvements[w]
                                    .split("\n")
                                    .map((line, j) => (
                                      <p key={j} className="mb-1 last:mb-0">
                                        {line}
                                      </p>
                                    ))}
                                </motion.div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 改进建议 */}
                  <Card>
                    <CardContent className="p-4">
                      <h4 className="flex items-center gap-2 font-semibold mb-3 text-sm">
                        <Lightbulb className="size-4 text-yellow-500" />
                        改进建议
                      </h4>
                      <ul className="space-y-3">
                        {result.suggestions.map((s, i) => (
                          <li key={i} className="group">
                            <div className="flex items-start gap-3 text-sm">
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                                {i + 1}
                              </span>
                              <span className="flex-1 pt-px">{s}</span>
                              <button
                                onClick={() => handleImprove(s, "suggestion")}
                                disabled={improving === s}
                                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 disabled:opacity-100"
                                title="AI 优化"
                              >
                                {improving === s ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Wand2 className="size-4" />
                                )}
                              </button>
                            </div>
                            {improvements[s] && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="ml-8 mt-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground/80"
                              >
                                <div className="mb-1 flex items-center gap-1 text-primary">
                                  <Sparkles className="size-3" />
                                  <span className="font-medium">
                                    AI 优化建议
                                  </span>
                                  <button
                                    onClick={() => {
                                      const next = { ...improvements };
                                      delete next[s];
                                      setImprovements(next);
                                    }}
                                    className="ml-auto text-muted-foreground hover:text-foreground"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {improvements[s].split("\n").map((line, j) => (
                                  <p key={j} className="mb-1 last:mb-0">
                                    {line}
                                  </p>
                                ))}
                              </motion.div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
