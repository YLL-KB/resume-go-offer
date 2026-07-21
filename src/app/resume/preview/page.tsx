"use client";

import { useEffect, useState } from "react";
import { TemplateModern } from "@/components/resume/TemplateModern";
import { TemplateClassic } from "@/components/resume/TemplateClassic";
import { DEFAULT_RESUME_DATA, type ResumeData } from "@/lib/validators/resume.schema";
import { Loader2 } from "lucide-react";

export default function ResumePreviewPage() {
  const [data, setData] = useState<ResumeData | null>(null);
  const [template, setTemplate] = useState<string>("modern");

  useEffect(() => {
    const raw = localStorage.getItem("resume_preview_data");
    const tpl = localStorage.getItem("resume_preview_template");
    if (raw) {
      try { setData({ ...DEFAULT_RESUME_DATA, ...JSON.parse(raw) }); } catch { /* ignore */ }
    }
    if (tpl) setTemplate(tpl);
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TemplateComponent = template === "classic" ? TemplateClassic : TemplateModern;

  return (
    <div className="flex min-h-screen justify-center bg-gray-100 p-10">
      <div className="bg-white shadow-2xl w-[210mm] min-h-[297mm]">
        <TemplateComponent data={data} />
      </div>
    </div>
  );
}
