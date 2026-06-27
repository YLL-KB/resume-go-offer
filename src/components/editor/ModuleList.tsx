"use client";

import { cn } from "@/lib/utils";
import type { Module } from "@/lib/pdf/module-detector";

interface ModuleListProps {
  modules: Module[];
  activeModuleId: string | null;
  editedModuleIds: Set<string>;
  onSelectModule: (moduleId: string) => void;
}

export function ModuleList({
  modules,
  activeModuleId,
  editedModuleIds,
  onSelectModule,
}: ModuleListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
        简历模块 ({modules.length})
      </div>
      <div className="flex-1 overflow-auto">
        {modules.map((m) => {
          const isActive = m.id === activeModuleId;
          const isEdited = editedModuleIds.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectModule(m.id)}
              className={cn(
                "w-full text-left px-3 py-2 border-b border-border/50 transition-colors",
                "hover:bg-muted/50",
                isActive && "bg-primary/10 border-l-2 border-l-primary",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate flex-1">
                  {m.label}
                </span>
                {isEdited && (
                  <span className="size-1.5 rounded-full bg-primary shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                <span>第 {m.page} 页</span>
                <span>{m.blocks.length} 个文字块</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
