"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PreviewContent } from "./PreviewContent";

/**
 * 简历独立预览页。
 * 支持两种来源：
 *  - ?id=xxx：从「我的简历」进入，按 id 从后端加载
 *  - 无 id：兼容旧流程（localStorage resume_preview_data）
 */
export default function ResumePreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
