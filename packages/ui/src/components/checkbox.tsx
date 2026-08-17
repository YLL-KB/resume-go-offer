"use client";

/**
 * Checkbox — 复选框（无外部依赖实现，样式对齐 emerald 主题）
 *
 * 基于原生 input[type=checkbox] 包装（sr-only 视觉隐藏 + 自定义外观），
 * 配合 @resume/ui 的 Label 组件使用。
 */

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../lib/utils";

const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type"> & { onCheckedChange?: (checked: boolean) => void }
>(({ className, onCheckedChange, onChange, ...props }, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onCheckedChange?.(e.target.checked);
  };

  return (
    <span className={cn("relative inline-flex size-4 shrink-0 align-middle", className)}>
      <input
        ref={ref}
        type="checkbox"
        onChange={handleChange}
        className={cn(
          "peer size-4 cursor-pointer appearance-none rounded-[4px] border border-slate-300 bg-white",
          "transition-colors checked:border-emerald-500 checked:bg-emerald-500",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute left-0 top-0 size-4 p-[1px] text-white opacity-0 transition-opacity peer-checked:opacity-100" />
    </span>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
