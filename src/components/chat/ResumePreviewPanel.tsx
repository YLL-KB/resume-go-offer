"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/stores/chat-store";
import { TemplateClassic } from "@/components/resume/TemplateClassic";
import { TemplateModern } from "@/components/resume/TemplateModern";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, FileCode, Palette } from "lucide-react";

type Template = "classic" | "modern";
type ExportFormat = "pdf" | "html";

const TEMPLATES: { key: Template; label: string }[] = [
  { key: "classic", label: "经典" },
  { key: "modern", label: "现代" },
];

export function ResumePreviewPanel() {
  const { resumeData, showPreview, setShowPreview } = useChatStore();
  const [template, setTemplate] = useState<Template>("modern");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPreview || !resumeData) return;
    const beforePrint = () => {
      const src = document.querySelector(".print-resume");
      if (!src) return;
      let root = document.getElementById("print-root");
      if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
      root.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = [
        `* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`,
        `html { height: auto !important; background: #f3f4f6 !important; }`,
        `body { height: auto !important; min-height: 100vh !important; background: #f3f4f6 !important; margin: 0 !important; padding: 0 !important; }`,
      ].join("\n");
      style.setAttribute("data-print-bg", "1");
      document.head.appendChild(style);
      // 固定背景层：print 模式下 position:fixed 会每页重复渲染
      const bg = document.createElement("div");
      bg.style.cssText = "position:fixed;inset:0;background:#f3f4f6;z-index:0;";
      root.appendChild(bg);
      const clone = src.cloneNode(true) as HTMLElement;
      clone.className = "mx-auto w-[210mm] min-h-[297mm] bg-gray-100";
      clone.style.position = "relative";
      clone.style.zIndex = "1";
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
  }, [showPreview, resumeData]);

  if (!showPreview || !resumeData) return null;

  const handleExport = () => {
    if (format === "pdf") { window.print(); } else {
      // 存到 localStorage，打开同 App 预览页，样式一致
      localStorage.setItem("resume_preview_data", JSON.stringify(resumeData));
      localStorage.setItem("resume_preview_template", template);
      window.open("/resume/preview", "_blank");
    }
  };

  const TemplateComponent = template === "modern" ? TemplateModern : TemplateClassic;

  return (
    <div className="flex h-full flex-col border-l bg-muted/20">
      <div className="flex items-center justify-between border-b px-3 py-2 gap-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">简历预览</span>

        <div className="flex items-center gap-0.5">
          <Palette className="size-3 text-muted-foreground" />
          {TEMPLATES.map((t) => (
            <Button key={t.key} variant={template === t.key ? "default" : "ghost"} size="sm" className="h-5 px-2 text-[10px]" onClick={() => setTemplate(t.key)}>{t.label}</Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button variant={format === "pdf" ? "default" : "ghost"} size="sm" className="h-5 px-2 text-[10px]" onClick={() => setFormat("pdf")}><FileText className="size-3 mr-0.5" />PDF</Button>
          <Button variant={format === "html" ? "default" : "ghost"} size="sm" className="h-5 px-2 text-[10px]" onClick={() => setFormat("html")}><FileCode className="size-3 mr-0.5" />HTML</Button>
          <Button size="sm" className="h-6 px-2 text-xs" onClick={handleExport}><Download className="size-3 mr-0.5" />{format === "pdf" ? "打印" : "下载"}</Button>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setShowPreview(false)}><X className="size-3.5" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div ref={printRef} className="print-resume mx-auto bg-gray-100 shadow-lg w-full max-w-[210mm] min-h-[297mm]">
          <TemplateComponent data={resumeData} />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {format === "pdf" ? "打开打印预览 → 目标打印机选「另存为 PDF」" : "下载为独立 HTML 文件，可直接用浏览器打开"}
        </p>
      </div>
    </div>
  );
}
