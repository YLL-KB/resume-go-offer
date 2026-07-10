"use client";

import { useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Eye, Plus, Menu, PanelLeftClose } from "lucide-react";

export function ChatHeader({
  onToggleSidebar,
  showSidebar,
}: {
  onToggleSidebar: () => void;
  showSidebar: boolean;
}) {
  const { resumeData, startNewChat, messages } = useChatStore();

  const hasResume = resumeData !== null;
  const hasStarted = messages.length > 0;

  const handlePreview = useCallback(() => {
    const src = document.querySelector(".print-resume");
    if (!src) return;
    let root = document.getElementById("print-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "print-root";
      root.className = "hidden print:block";
      document.body.appendChild(root);
    }
    root.innerHTML = "";
    const clone = src.cloneNode(true) as HTMLElement;
    clone.className = "print-resume w-[210mm] min-h-[297mm] bg-white";
    root.appendChild(clone);
    window.print();
    setTimeout(() => root?.remove(), 500);
  }, []);

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar}>
          {showSidebar ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <Menu className="size-4" />
          )}
        </Button>
        <h1 className="text-base font-semibold">简历顾问</h1>
        {hasStarted && (
          <Button variant="ghost" size="sm" onClick={startNewChat}>
            <Plus />
            新对话
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasResume && (
          <Button size="sm" onClick={handlePreview}>
            <Eye />
            查看简历
          </Button>
        )}
      </div>
    </header>
  );
}
