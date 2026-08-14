"use client";

import { useState } from "react";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { DEFAULT_RESUME_DATA, type ResumeData } from "@/lib/validators/resume.schema";
import { Loader2 } from "lucide-react";

const getInitialData = (): ResumeData | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("resume_preview_data");
    if (raw) return { ...DEFAULT_RESUME_DATA, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return null;
};

export default function ResumePreviewPage() {
  const [data] = useState<ResumeData | null>(getInitialData);

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
