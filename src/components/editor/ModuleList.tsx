"use client";

import { Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Module } from "@/lib/pdf/module-detector";

interface ModuleListProps {
  modules: Module[];
  activeModuleId: string | null;
  editedModuleIds: Set<string>;
  deletedModules: Set<string>;
  onSelectModule: (moduleId: string) => void;
  onToggleDelete: (moduleId: string) => void;
}

export function ModuleList({
  modules,
  activeModuleId,
  editedModuleIds,
  deletedModules,
  onSelectModule,
  onToggleDelete,
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
          const isDeleted = deletedModules.has(m.id);

          return (
            <div
              key={m.id}
              className={cn(
                "group flex items-center border-b border-border/50 transition-colors",
                isActive && "bg-primary/10 border-l-2 border-l-primary",
                isDeleted && "opacity-40",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectModule(m.id)}
                className={cn(
                  "flex-1 text-left px-3 py-2 transition-colors",
                  "hover:bg-muted/50",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-xs font-medium truncate",
                      isDeleted && "line-through",
                    )}
                  >
                    {m.label}
                  </span>
                  {isEdited && !isDeleted && (
                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  <span>第 {m.page} 页</span>
                  <span>{m.blocks.length} 个文字块</span>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDelete(m.id);
                }}
                title={isDeleted ? "恢复模块" : "删除模块内容"}
                className={cn(
                  "shrink-0 p-1.5 mr-1 rounded transition-colors",
                  "opacity-0 group-hover:opacity-100",
                  isDeleted
                    ? "opacity-100 text-green-500 hover:bg-green-50"
                    : "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                )}
              >
                {isDeleted ? (
                  <Undo2 className="size-3.5" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
