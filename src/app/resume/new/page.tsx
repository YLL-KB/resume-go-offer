"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useResumeForm } from "@/hooks/use-resume-form";
import { ResumeData } from "@/lib/validators/resume.schema";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StepIndicator } from "@/components/resume/StepIndicator";
import { BasicInfoStep } from "@/components/resume/BasicInfoStep";
import { EducationStep } from "@/components/resume/EducationStep";
import { WorkStep } from "@/components/resume/WorkStep";
import { ProjectStep } from "@/components/resume/ProjectStep";
import { SkillsStep } from "@/components/resume/SkillsStep";
import { TemplateClassic } from "@/components/resume/TemplateClassic";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ArrowLeft,
  Eye,
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function NewResumePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const templateId = searchParams.get("template");
  const { step, steps, form, next, prev, goTo, isFirst, isLast } = useResumeForm();
  const data = form.watch();

  const [templateName, setTemplateName] = useState<string | null>(null);

  // 如果有模版参数，获取模版名称
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        const list: { id: string; name: string }[] = await res.json();
        const found = list.find((t) => t.id === templateId);
        if (found) setTemplateName(found.name);
      } catch {
        // 忽略
      }
    })();
  }, [templateId]);

  const templatePdfUrl = templateId ? `/uploads/templates/${templateId}.pdf` : null;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              返回
            </button>
            <StepIndicator steps={steps} current={step} onStepClick={goTo} />
            {templateName && (
              <Badge variant="secondary" className="gap-1.5">
                <LayoutTemplate className="size-3" />
                {templateName}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Eye className="mr-1.5 size-4" />
              打印/导出 PDF
            </Button>
            <Button size="sm" disabled>
              保存
            </Button>
          </div>
        </div>
      </header>

      {/* Body: 左表单 + 右预览 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧表单 */}
        <div className="flex w-full flex-col border-r lg:w-1/2">
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-xl p-6 lg:p-8">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold">
                <FileText className="size-5 text-primary" />
                {steps[step]}
              </h2>

              {step === 0 && <BasicInfoStep form={form} />}
              {step === 1 && <EducationStep form={form} />}
              {step === 2 && <WorkStep form={form} />}
              {step === 3 && <ProjectStep form={form} />}
              {step === 4 && <SkillsStep form={form} />}
            </div>
          </ScrollArea>

          {/* 底部导航按钮 */}
          <div className="flex items-center justify-between border-t p-4">
            <Button variant="ghost" onClick={prev} disabled={isFirst}>
              <ChevronLeft className="mr-1 size-4" />
              上一步
            </Button>
            <span className="text-xs text-muted-foreground">
              {step + 1} / {steps.length}
            </span>
            <Button onClick={next} disabled={isLast}>
              {isLast ? "完成" : "下一步"}
              {!isLast && <ChevronRight className="ml-1 size-4" />}
            </Button>
          </div>
        </div>

        {/* 右侧预览 — 桌面端显示 */}
        <div className="hidden flex-1 bg-muted/30 lg:flex lg:items-start lg:justify-center lg:overflow-auto lg:p-6">
          {templatePdfUrl ? (
            /* 有模版时显示 PDF 预览 */
            <div className="w-full h-full">
              <iframe
                src={`${templatePdfUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full rounded-lg border"
                title={templateName ?? "模版预览"}
              />
            </div>
          ) : (
            /* 无模版时显示 Classic 渲染预览 */
            <div className="w-full max-w-[210mm] origin-top scale-[0.65] xl:scale-75 2xl:scale-90">
              <TemplateClassic data={data as ResumeData} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
