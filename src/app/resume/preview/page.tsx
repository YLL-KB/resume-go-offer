"use client";

import { useEffect, useState } from "react";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { DEFAULT_RESUME_DATA, type ResumeData } from "@/lib/validators/resume.schema";
import { Loader2 } from "lucide-react";

export default function ResumePreviewPage() {
  const [data, setData] = useState<ResumeData | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("resume_preview_data");
    if (raw) {
      try { setData({ ...DEFAULT_RESUME_DATA, ...JSON.parse(raw) }); } catch { /* ignore */ }
    }
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-gray-100 p-10">
      <TemplateResume data={data} />
    </div>
  );
}
