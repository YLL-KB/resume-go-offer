"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@resume/ui";
import { Plus, Menu, Sparkles, Settings2, Gauge } from "lucide-react";
import { ModelSettingsDialog } from "./ModelSettingsDialog";
import { UsageDialog } from "./UsageDialog";

export function ChatHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const router = useRouter();
  const { startNewChat, messages } = useChatStore();
  const hasStarted = messages.length > 0;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

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

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-500 hover:text-slate-900"
          title="我的用量"
          onClick={() => setUsageOpen(true)}
        >
          <Gauge className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-500 hover:text-slate-900"
          title="模型设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 className="size-4" />
        </Button>
      </div>

      <ModelSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <UsageDialog open={usageOpen} onOpenChange={setUsageOpen} />
    </header>
  );
}
