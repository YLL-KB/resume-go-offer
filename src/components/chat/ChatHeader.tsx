"use client";

import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Plus, Menu } from "lucide-react";

export function ChatHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { startNewChat, messages } = useChatStore();
  const hasStarted = messages.length > 0;

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onToggleSidebar}>
          <Menu className="size-4" />
        </Button>
        <h1 className="text-base font-semibold">简历顾问</h1>
        {hasStarted && (
          <Button variant="ghost" size="sm" onClick={startNewChat}>
            <Plus className="size-4" />新对话
          </Button>
        )}
      </div>
    </header>
  );
}
