"use client";

import { useState, useCallback } from "react";
import { useForm, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resumeDataSchema, ResumeData, DEFAULT_RESUME_DATA } from "@/lib/validators/resume.schema";

const STEPS = ["基本信息", "教育经历", "工作经历", "项目经验", "技能标签"] as const;

export function useResumeForm() {
  const [step, setStep] = useState(0);

  const form = useForm({
    resolver: zodResolver(resumeDataSchema),
    defaultValues: DEFAULT_RESUME_DATA,
    mode: "onChange",
  });

  const next = useCallback(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), []);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);
  const goTo = useCallback((s: number) => setStep(s), []);

  return {
    step,
    steps: STEPS,
    form,
    next,
    prev,
    goTo,
    isFirst: step === 0,
    isLast: step === STEPS.length - 1,
  };
}

export type ResumeForm = UseFormReturn<ResumeData>;
