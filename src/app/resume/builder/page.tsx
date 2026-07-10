/**
 * /resume/builder — 表单式简历生成器
 *
 * 填表单 → 预览 → 导出 PDF
 */

"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resumeDataSchema, DEFAULT_RESUME_DATA, type ResumeData } from "@/lib/validators/resume.schema";
import { BasicInfoStep } from "@/components/resume/BasicInfoStep";
import { EducationStep } from "@/components/resume/EducationStep";
import { WorkStep } from "@/components/resume/WorkStep";
import { ProjectStep } from "@/components/resume/ProjectStep";
import { SkillsStep } from "@/components/resume/SkillsStep";
import { StepIndicator } from "@/components/resume/StepIndicator";
import { TemplateClassic } from "@/components/resume/TemplateClassic";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, Eye, Download, Edit3 } from "lucide-react";

const STEPS = ["基本信息", "教育经历", "工作经历", "项目经验", "技能标签"] as const;

export default function ResumeBuilderPage() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const form = useForm<ResumeData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(resumeDataSchema) as any,
    defaultValues: DEFAULT_RESUME_DATA,
    mode: "onChange",
  });

  const { handleSubmit, control } = form;
  const resumeData = (useWatch({ control }) ?? DEFAULT_RESUME_DATA) as ResumeData;

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const onFinish = () => {
    setSubmitted(true);
    setShowPreview(true);
  };

  // 转发 form 给子组件（子组件定义了 UseFormReturn<any>，这里必须转换）
  const formProxy = form as unknown as Record<string, unknown>;

  // 预览模式
  if (submitted && showPreview) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-3">
          <h1 className="text-base font-semibold">简历预览</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>
              <Edit3 className="mr-1.5 size-4" />继续编辑
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Download className="mr-1.5 size-4" />导出 PDF
            </Button>
          </div>
        </div>
        <div className="flex justify-center py-10">
          <div className="bg-white shadow-xl" style={{ width: "210mm", minHeight: "297mm" }}>
            <TemplateClassic data={resumeData} />
          </div>
        </div>
      </div>
    );
  }

  // 表单模式
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">制作简历</h1>
      <p className="mb-8 text-muted-foreground">填写以下信息，生成专业简历</p>

      <StepIndicator steps={STEPS} current={step} onStepClick={setStep} />

      <form onSubmit={handleSubmit(onFinish)} className="mt-8 rounded-xl border bg-card p-6">
        {/* eslint-disable @typescript-eslint/no-explicit-any */}
        {step === 0 && <BasicInfoStep form={formProxy as any} />}
        {step === 1 && <EducationStep form={formProxy as any} />}
        {step === 2 && <WorkStep form={formProxy as any} />}
        {step === 3 && <ProjectStep form={formProxy as any} />}
        {step === 4 && <SkillsStep form={formProxy as any} />}
        {/* eslint-enable @typescript-eslint/no-explicit-any */}

        <div className="mt-8 flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isFirst}>
            <ArrowLeft className="mr-1.5 size-4" />上一步
          </Button>

          {isLast ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowPreview(true)}>
                <Eye className="mr-1.5 size-4" />预览
              </Button>
              <Button type="submit">
                <Check className="mr-1.5 size-4" />生成简历
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              下一步<ArrowRight className="ml-1.5 size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
