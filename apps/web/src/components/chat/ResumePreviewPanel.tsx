"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { Button } from "@resume/ui";
import { Download, X, FileText, FileCode, Loader2, AlertTriangle } from "lucide-react";
import { type ResumeTheme, THEMES } from "@/components/resume/TemplateResume";

type ExportFormat = "pdf" | "html";

export function ResumePreviewPanel() {
  const { resumeData, previewData, skillsHtmlMap, showPreview, setShowPreview, setSkillsHtmlMap, resumeTheme, setResumeTheme } = useChatStore();
  // demo 预览：优先展示独立 previewData（示例简历），否则用用户真实简历数据
  const effectiveData = previewData ?? resumeData;
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [generating, setGenerating] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);

  // ── 生成技能 HTML ──
  const generate = useCallback(async () => {
    if (!effectiveData || generatingRef.current) return;

    generatingRef.current = true;
    setGenerating(true);
    setRenderError(null);

    try {
      const { readRenderSkillsSSE } = await import("@/lib/utils/sse");
      const res = await fetch("/api/resume/render-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorizedSkills: effectiveData?.categorizedSkills ?? {},
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
  }, [effectiveData, setSkillsHtmlMap]);

  // 首次展开预览时自动生成
  useEffect(() => {
    if (showPreview && effectiveData && !skillsHtmlMap && !generatingRef.current) {
      generate();
    }
  }, [showPreview, effectiveData, skillsHtmlMap, generate]);

  // ── 打印处理 ──
  useEffect(() => {
    if (!showPreview || !effectiveData) return;
    const beforePrint = () => {
      const src = document.querySelector(".print-resume");
      if (!src) return;

      const style = document.createElement("style");
      style.setAttribute("data-print-bg", "1");
      style.textContent = [
        `@page { margin: 0.6cm 0 0 0; size: A4; }`,
        `html, body { margin: 0 !important; padding: 0 !important; }`,
        // fixed 伪元素在打印时每页都会渲染，天然铺满整页
        `body::after { content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #f3f4f6; z-index: -1; }`,
        `html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`,
      ].join("\n");
      document.body.appendChild(style);

      let root = document.getElementById("print-root");
      if (!root) {
        root = document.createElement("div");
        root.id = "print-root";
        document.body.appendChild(root);
      }
      root.innerHTML = "";
      root.style.cssText = [
        `width:210mm;margin:0 auto;`,
        `background:#ffffff;`,
        `position:relative;z-index:1;`,
        `-webkit-print-color-adjust:exact;`,
        `print-color-adjust:exact;`,
      ].join("");

      const clone = src.cloneNode(true) as HTMLElement;
      // 去掉组件自带 @page 规则，避免覆盖我们的（margin 不一致会导致页面高度计算偏差）
      clone.querySelectorAll("style").forEach((s) => {
        s.textContent = (s.textContent ?? "").replace(/@page\s*\{[^}]*\}/g, "");
      });
      clone.querySelectorAll("*").forEach((el) => {
        (el as HTMLElement).style.minHeight = "0";
      });
      clone.style.minHeight = "0";
      root.appendChild(clone);
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
  }, [showPreview, effectiveData]);

  if (!showPreview || !effectiveData) return null;

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
          {/* 主题切换 */}
          <div className="flex items-center gap-0.5 mr-1">
            {(Object.keys(THEMES) as ResumeTheme[]).map((key) => (
              <Button
                key={key}
                variant="ghost"
                size="icon"
                title={THEMES[key].name}
                className={`size-5 rounded-full border-2 transition-all ${resumeTheme === key ? "border-slate-400 scale-110" : "border-transparent hover:scale-105"}`}
                style={{ background: THEMES[key].primary }}
                onClick={() => setResumeTheme(key)}
              />
            ))}
          </div>
          <div className="w-px h-4 bg-gray-200 mr-1" />
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
            <TemplateResume data={effectiveData} skillsHtml={skillsHtml} theme={resumeTheme} />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          {format === "pdf" ? "打开打印预览 → 目标打印机选「另存为 PDF」" : "下载为独立 HTML 文件，可直接用浏览器打开"}
        </p>
      </div>
    </div>
  );
}
