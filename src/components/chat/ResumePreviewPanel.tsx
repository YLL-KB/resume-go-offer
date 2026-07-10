"use client";

import { useChatStore } from "@/stores/chat-store";
import { TemplateClassic } from "@/components/resume/TemplateClassic";
import { Download, X } from "lucide-react";

export function ResumePreviewPanel() {
  const { resumeData, showPreview, setShowPreview } = useChatStore();

  if (!showPreview || !resumeData) return null;

  const handleExportDocx = () => {
    // TODO: Word 导出
  };

  return (
    <div className="flex h-full flex-col border-l bg-muted/20">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">简历预览</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportDocx}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted transition-colors"
          >
            <Download className="size-3" />
            PDF
          </button>
          <button
            onClick={() => setShowPreview(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 简历预览 — 缩放到适合侧边栏 */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="mx-auto bg-white shadow-lg"
          style={{
            width: "210mm",
            minHeight: "297mm",
            transform: "scale(0.45)",
            transformOrigin: "top center",
          }}
        >
          <TemplateClassic data={resumeData} />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          这是预览效果，实际导出为 A4 PDF 格式
        </p>
      </div>
    </div>
  );
}
