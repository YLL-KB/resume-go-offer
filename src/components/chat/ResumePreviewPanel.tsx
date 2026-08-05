"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, FileCode, Loader2, AlertTriangle } from "lucide-react";

type ExportFormat = "pdf" | "html";

export function ResumePreviewPanel() {
  const { resumeData, skillsHtmlMap, showPreview, setShowPreview, setSkillsHtmlMap } = useChatStore();
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [generating, setGenerating] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);

  // ── 生成技能 HTML ──
  const generate = useCallback(async () => {
    if (!resumeData || generatingRef.current) return;

    generatingRef.current = true;
    setGenerating(true);
    setRenderError(null);

    try {
      const { readRenderSkillsSSE } = await import("@/lib/utils/sse");
      const res = await fetch("/api/resume/render-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorizedSkills: resumeData?.categorizedSkills ?? {},
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const html = await readRenderSkillsSSE(res);
      if (html) {
        setSkillsHtmlMap({ default: html });
      }
    } catch (err) {
      console.error("Skills render failed:", err);
      setRenderError(err instanceof Error ? err.message : "生成失败，请重试");
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  }, [resumeData, setSkillsHtmlMap]);

  // 首次展开预览时自动生成
  useEffect(() => {
    if (showPreview && resumeData && !skillsHtmlMap && !generatingRef.current) {
      generate();
    }
  }, [showPreview, resumeData, skillsHtmlMap, generate]);

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

      const pageHeight = 297;
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

  const skillsHtml = skillsHtmlMap?.default ?? null;

  const handleExport = () => {
    if (format === "pdf") {
      window.print();
    } else {
      const printEl = document.querySelector(".print-resume");
      const html = printEl?.innerHTML ?? "";
      const blob = new Blob([`<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>简历</title></head><body style="margin:0;background:#f3f4f6;display:flex;justify-content:center;">${html}</body></html>`], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "resume.html"; a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-gray-200/60 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200/60 bg-white/80 backdrop-blur-xl px-3 py-2 gap-2">
        <span className="text-xs font-medium text-slate-500 shrink-0">简历预览</span>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            className={`h-5 px-2 text-[10px] ${format === "pdf" ? "bg-emerald-50 text-emerald-700" : "text-slate-400 hover:text-slate-900"}`}
            onClick={() => setFormat("pdf")}
          ><FileText className="size-3 mr-0.5" />PDF</Button>
          <Button
            variant="ghost" size="sm"
            className={`h-5 px-2 text-[10px] ${format === "html" ? "bg-emerald-50 text-emerald-700" : "text-slate-400 hover:text-slate-900"}`}
            onClick={() => setFormat("html")}
          ><FileCode className="size-3 mr-0.5" />HTML</Button>
          <Button size="sm" className="h-6 px-2 text-xs bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white transition-all duration-200" onClick={handleExport}><Download className="size-3 mr-0.5" />{format === "pdf" ? "打印" : "下载"}</Button>
          <Button variant="ghost" size="icon" className="size-6 text-slate-400 hover:text-slate-900" onClick={() => setShowPreview(false)}><X className="size-3.5" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 p-4">
        <div
          ref={printRef}
          className="print-resume mx-auto w-full max-w-[210mm]"
        >
          {generating && !skillsHtml ? (
            <div className="flex flex-col items-center justify-center py-40 gap-3 bg-white/50 min-h-[297mm]">
              <Loader2 className="size-6 animate-spin text-slate-300" />
              <span className="text-sm text-slate-500">AI 正在生成技能区块...</span>
              <span className="text-xs text-slate-400">预计 5-15 秒</span>
            </div>
          ) : renderError && !skillsHtml ? (
            <div className="flex flex-col items-center justify-center py-40 gap-3 bg-white/50 min-h-[297mm]">
              <AlertTriangle className="size-6 text-amber-500" />
              <span className="text-sm text-slate-500">{renderError}</span>
              <Button
                size="sm"
                variant="outline"
                className="border-gray-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => { setSkillsHtmlMap(null); setRenderError(null); }}
              >
                重试
              </Button>
            </div>
          ) : (
            <TemplateResume data={resumeData} skillsHtml={skillsHtml} />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          {format === "pdf" ? "打开打印预览 → 目标打印机选「另存为 PDF」" : "下载为独立 HTML 文件，可直接用浏览器打开"}
        </p>
      </div>
    </div>
  );
}
