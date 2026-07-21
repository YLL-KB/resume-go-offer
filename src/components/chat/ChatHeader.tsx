"use client";

import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Plus, Menu, PanelLeftClose } from "lucide-react";

export function ChatHeader({
  onToggleSidebar,
  showSidebar,
}: {
  onToggleSidebar: () => void;
  showSidebar: boolean;
}) {
  const { startNewChat, messages } = useChatStore();
  const hasStarted = messages.length > 0;

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar}>
          {showSidebar ? <PanelLeftClose className="size-4" /> : <Menu className="size-4" />}
        </Button>
        <h1 className="text-base font-semibold">简历顾问</h1>
        {hasStarted && (
          <Button variant="ghost" size="sm" onClick={startNewChat}>
            <Plus />新对话
          </Button>
        )}
      </div>
    </header>
  );
}
