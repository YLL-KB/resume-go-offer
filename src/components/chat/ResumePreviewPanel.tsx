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
      const style = document.createElement("style");
      style.setAttribute("data-print-bg", "1");
      style.textContent = [
        `* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`,
        `html, body { margin: 0 !important; padding: 0 !important; background: #f3f4f6 !important; }`,
      ].join("\n");
      document.head.appendChild(style);

      // ── 阶段 1：测量真实内容高度（去掉 min-height 避免虚高）──
      const measureClone = src.cloneNode(true) as HTMLElement;
      measureClone.style.cssText = "position:absolute;visibility:hidden;width:210mm;top:0;left:0;min-height:0;";
      document.body.appendChild(measureClone);
      // 把内部模板的 min-height 也干掉
      measureClone.querySelectorAll("*").forEach((el) => {
        (el as HTMLElement).style.minHeight = "0";
      });
      const contentHeightPx = measureClone.scrollHeight;
      document.body.removeChild(measureClone);

      const mmPerPx = 25.4 / 96;
      const contentHeightMm = contentHeightPx * mmPerPx;
      const pageHeightMm = 297;
      const pages = Math.max(1, Math.ceil(contentHeightMm / pageHeightMm));
      const targetMm = pages * pageHeightMm;
      const paddingMm = Math.max(0, targetMm - contentHeightMm);

      // ── 阶段 2：补 padding 撑到整页倍数，inline style 保证背景色生效 ──
      let root = document.getElementById("print-root");
      if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
      root.innerHTML = "";

      const clone = src.cloneNode(true) as HTMLElement;
      clone.style.minHeight = "0";
      clone.style.background = "#f3f4f6";
      clone.style.paddingBottom = `${paddingMm}mm`;
      clone.style.boxSizing = "border-box";
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
