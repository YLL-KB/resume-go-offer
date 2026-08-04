"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, FileCode, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

type SkillStyle = "A" | "B" | "D";
type ExportFormat = "pdf" | "html";

const ALL_STYLES: SkillStyle[] = ["A", "B", "D"];

const STYLE_LABELS: Record<SkillStyle, string> = {
  A: "双栏分类", B: "侧栏Pill", D: "标签云",
};

const RENDER_TIMEOUT = 90_000; // 单个风格超时 90s

export function ResumePreviewPanel() {
  const { resumeData, skillsHtmlMap, showPreview, setShowPreview, setSkillsHtmlMap } = useChatStore();
  const [skillStyle, setSkillStyle] = useState<SkillStyle>("B");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [generating, setGenerating] = useState(false);
  const [completedStyles, setCompletedStyles] = useState<Set<SkillStyle>>(new Set());
  const [renderError, setRenderError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generatingRef = useRef(false);

  // ── 生成单个风格的技能 HTML ──
  const generateOne = useCallback(async (style: SkillStyle, signal: AbortSignal): Promise<string | null> => {
    const { readRenderSkillsSSE } = await import("@/lib/utils/sse");
    const res = await fetch("/api/resume/render-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categorizedSkills: resumeData?.categorizedSkills ?? {},
        skillStyle: style,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "请求失败" }));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    return readRenderSkillsSSE(res, undefined, signal);
  }, [resumeData]);

  // ── 并行生成全部 3 种风格的技能 HTML ──
  const generateAll = useCallback(async () => {
    if (!resumeData || generatingRef.current) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    generatingRef.current = true;
    setGenerating(true);
    setRenderError(null);
    setCompletedStyles(new Set());

    const timeout = setTimeout(() => abortRef.current?.abort(), RENDER_TIMEOUT);

    const map: Record<string, string> = { ...(skillsHtmlMap ?? {}) };
    let hasError = false;

    const tasks = ALL_STYLES.map(async (style) => {
      try {
        const html = await generateOne(style, signal);
        if (html) {
          map[style] = html;
          setSkillsHtmlMap({ ...map });
        }
        setCompletedStyles((prev) => new Set(prev).add(style));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(`[Style ${style}] failed:`, err);
        hasError = true;
        setCompletedStyles((prev) => new Set(prev).add(style));
      }
    });

    await Promise.all(tasks);
    clearTimeout(timeout);

    if (hasError && Object.keys(map).length === 0) {
      setRenderError("全部风格生成失败，请重试");
    }

    setGenerating(false);
    generatingRef.current = false;
    abortRef.current = null;
  }, [resumeData, skillsHtmlMap, setSkillsHtmlMap, generateOne]);

  // 首次展开预览时自动生成
  useEffect(() => {
    if (showPreview && resumeData && !skillsHtmlMap && !generatingRef.current) {
      generateAll();
    }
  }, [showPreview, resumeData, skillsHtmlMap, generateAll]);

  // ── 打印处理 ──
  useEffect(() => {
    if (!showPreview || !resumeData) return;
    const beforePrint = () => {
      const src = document.querySelector(".print-resume");
      if (!src) return;

      const style = document.createElement("style");
      style.setAttribute("data-print-bg", "1");
      style.textContent = [
        `@page { margin: 0; size: A4; }`,
        `html, body { margin: 0 !important; padding: 0 !important; }`,
        `html { background: #f3f4f6 !important; }`,
        `body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`,
      ].join("\n");
      document.head.appendChild(style);

      const measureClone = src.cloneNode(true) as HTMLElement;
      measureClone.style.cssText = "position:absolute;visibility:hidden;width:210mm;top:0;left:0;min-height:0;";
      document.body.appendChild(measureClone);
      measureClone.querySelectorAll("*").forEach((el) => {
        (el as HTMLElement).style.minHeight = "0";
      });
      const contentHeightPx = measureClone.scrollHeight;
      document.body.removeChild(measureClone);

      const mmPerPx = 25.4 / 96;
      const contentHeightMm = contentHeightPx * mmPerPx;

      const pageHeight = 297; // A4 mm
      const fullPageHeight = Math.ceil(contentHeightMm / pageHeight) * pageHeight;
      const padBottom = fullPageHeight - contentHeightMm;

      let root = document.getElementById("print-root");
      if (!root) {
        root = document.createElement("div");
        root.id = "print-root";
        document.body.appendChild(root);
      }
      root.innerHTML = "";
      root.style.cssText = [
        `width:210mm;margin:0 auto;`,
        `background:#f3f4f6;`,
        `-webkit-print-color-adjust:exact;`,
        `print-color-adjust:exact;`,
      ].join("");

      const clone = src.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("*").forEach((el) => {
        (el as HTMLElement).style.minHeight = "0";
      });
      clone.style.minHeight = "0";
      root.appendChild(clone);

      // 填充最后一页剩余空间
      if (padBottom > 1) {
        const filler = document.createElement("div");
        filler.style.cssText = `height:${padBottom}mm;`;
        root.appendChild(filler);
      }
    };
    const afterPrint = () => {
      document.getElementById("print-root")?.remove();
      document.querySelector("style[data-print-bg]")?.remove();
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [showPreview, resumeData]);

  if (!showPreview || !resumeData) return null;

  const skillsHtml = skillsHtmlMap?.[skillStyle] ?? null;
  const totalCount = ALL_STYLES.length;
  const completedCount = completedStyles.size;

  const handleExport = () => {
    if (format === "pdf") {
      window.print();
    } else {
      // 获取完整 HTML：复制 .print-resume 内容
      const printEl = document.querySelector(".print-resume");
      const html = printEl?.innerHTML ?? "";
      const blob = new Blob([`<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>简历 - ${STYLE_LABELS[skillStyle]}</title></head><body style="margin:0;background:#f3f4f6;display:flex;justify-content:center;">${html}</body></html>`], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `resume-${skillStyle}.html`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-[#e8e0d5] bg-[#faf7f2]">
      <div className="flex items-center justify-between border-b border-[#e8e0d5] bg-[#faf7f2]/80 backdrop-blur-xl px-3 py-2 gap-2">
        <span className="text-xs font-medium text-[#6b6859] shrink-0">简历预览</span>

        {/* 技能风格切换 — 不触发重新生成 */}
        <div className="flex items-center gap-0.5">
          {(Object.entries(STYLE_LABELS) as [SkillStyle, string][]).map(([key, label]) => {
            const hasHtml = skillsHtmlMap?.[key];
            const isPending = generating && !hasHtml;
            const isActive = skillStyle === key;
            return (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                className={`h-5 px-1.5 text-[10px] transition-colors ${
                  isActive
                    ? "bg-[#4a7c59]/10 text-[#4a7c59] hover:bg-[#4a7c59]/15"
                    : "text-[#9b9879] hover:text-[#3d3929] hover:bg-[#f5f0e8]"
                } ${isPending ? "opacity-50" : ""}`}
                onClick={() => { if (hasHtml || !generating) setSkillStyle(key); }}
                title={isPending ? `${label} 生成中...` : label}
              >
                {label}{isPending ? " ···" : ""}
              </Button>
            );
          })}
          <Button
            variant="ghost" size="icon" className="size-5 text-[#9b9879] hover:text-[#3d3929]"
            title="重新生成全部风格"
            onClick={() => setSkillsHtmlMap(null)}
            disabled={generating}
          >
            <RefreshCw className={`size-3 ${generating ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            className={`h-5 px-2 text-[10px] ${format === "pdf" ? "bg-[#4a7c59]/10 text-[#4a7c59]" : "text-[#9b9879] hover:text-[#3d3929]"}`}
            onClick={() => setFormat("pdf")}
          ><FileText className="size-3 mr-0.5" />PDF</Button>
          <Button
            variant="ghost" size="sm"
            className={`h-5 px-2 text-[10px] ${format === "html" ? "bg-[#4a7c59]/10 text-[#4a7c59]" : "text-[#9b9879] hover:text-[#3d3929]"}`}
            onClick={() => setFormat("html")}
          ><FileCode className="size-3 mr-0.5" />HTML</Button>
          <Button size="sm" className="h-6 px-2 text-xs bg-[#4a7c59] hover:bg-[#3d6b4a] text-white transition-colors duration-200" onClick={handleExport}><Download className="size-3 mr-0.5" />{format === "pdf" ? "打印" : "下载"}</Button>
          <Button variant="ghost" size="icon" className="size-6 text-[#9b9879] hover:text-[#3d3929]" onClick={() => setShowPreview(false)}><X className="size-3.5" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#faf7f2] p-4">
        <div
          ref={printRef}
          className="print-resume mx-auto w-full max-w-[210mm]"
        >
          {generating && !skillsHtml ? (
            <div className="flex flex-col items-center justify-center py-40 gap-3 bg-[#f5f0e8]/50 min-h-[297mm]">
              <Loader2 className="size-6 animate-spin text-[#d4c5a9]" />
              <span className="text-sm text-[#6b6859]">
                AI 正在生成 {completedCount}/{totalCount} 种风格...
              </span>
              <span className="text-xs text-[#9b9879]">仅生成技能区块，预计 5-15 秒</span>
            </div>
          ) : renderError && !skillsHtml ? (
            <div className="flex flex-col items-center justify-center py-40 gap-3 bg-[#f5f0e8]/50 min-h-[297mm]">
              <AlertTriangle className="size-6 text-amber-500" />
              <span className="text-sm text-[#6b6859]">{renderError}</span>
              <Button
                size="sm"
                className="border-[#e8e0d5] text-[#6b6859] hover:bg-[#f5f0e8] hover:text-[#3d3929]"
                onClick={() => { setSkillsHtmlMap(null); setRenderError(null); }}
              >
                重试
              </Button>
            </div>
          ) : (
            <>
              {generating && (
                <div className="sticky top-2 right-2 z-10 float-right flex items-center gap-1.5 rounded-full bg-[#f5f0e8] border border-[#e8e0d5] px-2.5 py-1 text-xs text-[#6b6859] shadow-sm backdrop-blur-sm">
                  <Loader2 className="size-3 animate-spin" />
                  {totalCount - completedCount} 种风格生成中...
                </div>
              )}
              <TemplateResume data={resumeData} skillsHtml={skillsHtml} />
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-[#9b9879]">
          {format === "pdf" ? "打开打印预览 → 目标打印机选「另存为 PDF」" : "下载为独立 HTML 文件，可直接用浏览器打开"}
        </p>
      </div>
    </div>
  );
}
