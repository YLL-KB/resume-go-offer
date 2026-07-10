"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ScanEye } from "lucide-react";

export function AnalyzingState() {
  const steps = ["读取文件内容...", "AI 理解简历结构...", "评估竞争力...", "生成改进建议..."];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="mb-8">
        <div className="relative size-20">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
          <ScanEye className="absolute inset-0 m-auto size-8 text-primary" />
        </div>
      </motion.div>
      <p className="text-lg font-semibold text-foreground">{steps[step]}</p>
      <p className="mt-1 text-sm text-muted-foreground">AI 正在仔细分析你的简历，请稍候...</p>
    </div>
  );
}
