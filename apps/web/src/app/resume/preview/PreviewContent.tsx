"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { PreviewPanel } from "@/components/preview";
import { DEFAULT_RESUME_DATA, type ResumeData } from "@/lib/validators/resume.schema";
import { getResume } from "@/lib/api/resume";
import { AppHeader } from "@resume/ui";
import { Button } from "@resume/ui";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

export function PreviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  const [data, setData] = useState<ResumeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 有 id → 从后端加载该简历
    if (id) {
      let cancelled = false;
      getResume(id)
        .then((detail) => {
          if (!cancelled) {
            setData(detail.data ?? null);
            if (!detail.data) setError("该简历暂无内容");
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
        });
      return () => {
        cancelled = true;
      };
    }

    // 无 id → 兼容旧流程（localStorage 直读）
    try {
      const raw = localStorage.getItem("resume_preview_data");
      if (raw) {
        setData({ ...DEFAULT_RESUME_DATA, ...JSON.parse(raw) });
      } else {
        setError("未找到要预览的简历，请从「我的简历」进入预览");
      }
    } catch {
      setError("预览数据解析失败");
    }
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <AppHeader />
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
          <AlertTriangle className="size-10 text-amber-500" />
          <p className="text-sm text-slate-600">{error}</p>
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="size-3.5 mr-1" />返回
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-100">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader />
      {/* A4 纸张仿真预览（项目原本的 PreviewPanel：分页线 + 自动一页纸） */}
      <div className="px-4 py-8">
        <PreviewPanel autoOnePage fullSize>
          <TemplateResume data={data} />
        </PreviewPanel>
      </div>
    </div>
  );
}
