"use client";

import { useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@resume/ui";
import { Plus, Menu, Sparkles } from "lucide-react";

export function ChatHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const router = useRouter();
  const { startNewChat, messages } = useChatStore();
  const hasStarted = messages.length > 0;

  return (
    <header className="flex items-center justify-between border-b border-gray-200/60 bg-white/70 backdrop-blur-xl px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="md:hidden text-slate-500 hover:text-slate-900" onClick={onToggleSidebar}>
          <Menu className="size-4" />
        </Button>
        <Sparkles className="size-4 text-emerald-500" />
        <h1 className="text-base font-semibold text-slate-900">简历顾问</h1>
        {hasStarted && (
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
            onClick={() => { startNewChat(); router.push("/chat"); }}
          >
            <Plus className="size-4" />新对话
          </Button>
        )}
      </div>
    </header>
  );
}
