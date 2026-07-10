"use client";

import { cn } from "@/lib/utils";

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size / 2) * 0.7;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "stroke-emerald-500" : score >= 50 ? "stroke-amber-500" : "stroke-red-500";
  const bg = score >= 70 ? "bg-emerald-50 text-emerald-700" : score >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="size-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={cn(color, "transition-all duration-1000 ease-out")}
        />
      </svg>
      <span className={cn("absolute flex flex-col items-center rounded-full px-3 py-1", bg)}>
        <span className="text-2xl font-extrabold tabular-nums">{score}</span>
        <span className="text-[10px] font-medium opacity-70">分</span>
      </span>
    </div>
  );
}
