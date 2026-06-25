"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ArrowLeft, Eye, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export default function EditResumePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { step, steps, form, next, prev, goTo, isFirst, isLast } = useResumeForm();
  const data = form.watch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载已有简历数据
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/resume/${id}`);
        if (!res.ok) throw new Error("简历不存在或无法加载");
        const row = await res.json() as { data: any };
        form.reset(row.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, form]);

  // 保存
  const handleSave = useCallback(async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("请检查表单中的错误");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/resume/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: form.getValues() }),
      });

      if (!res.ok) throw new Error("保存失败");
      toast.success("简历已保存");
    } catch (err) {
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [id, form]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-full max-w-lg space-y-4 p-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive text-lg">{error}</p>
        <Button variant="outline" onClick={() => router.back()}>
          返回上一页
        </Button>
      </div>
    );
  }

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
              返回预览
            </button>
            <StepIndicator steps={steps} current={step} onStepClick={goTo} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Eye className="mr-1.5 size-4" />
              打印/导出 PDF
            </Button>
            <Button size="sm" disabled={saving} onClick={handleSave}>
              {saving ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-4" />
              )}
              {saving ? "保存中..." : "保存"}
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

        {/* 右侧预览 */}
        <div className="hidden flex-1 bg-muted/30 lg:flex lg:items-start lg:justify-center lg:overflow-auto lg:p-6">
          <div className="w-full max-w-[210mm] origin-top scale-[0.65] xl:scale-75 2xl:scale-90">
            <TemplateClassic data={data as ResumeData} />
          </div>
        </div>
      </div>
    </div>
  );
}
