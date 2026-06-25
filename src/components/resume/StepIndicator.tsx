"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: readonly string[];
  current: number;
  onStepClick: (step: number) => void;
}

export function StepIndicator({ steps, current, onStepClick }: StepIndicatorProps) {
  return (
    <nav className="flex items-center gap-1" aria-label="简历步骤">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;

        return (
          <div key={label} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onStepClick(i)}
              disabled={i > current}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                done && "bg-primary/10 text-primary hover:bg-primary/20",
                active && "bg-primary text-primary-foreground",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="size-3" />
              ) : (
                <span className="flex size-4 items-center justify-center text-[10px]">
                  {i + 1}
                </span>
              )}
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={cn("h-px w-4", i < current ? "bg-primary/30" : "bg-border")} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
