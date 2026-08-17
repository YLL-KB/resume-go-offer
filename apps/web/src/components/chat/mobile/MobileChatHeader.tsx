"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Settings2, Gauge } from "lucide-react";
import { Button } from "@resume/ui";
import { useChatStore } from "@/stores/chat-store";
import { ModelSettingsDialog } from "../ModelSettingsDialog";
import { UsageDialog } from "../UsageDialog";

export function MobileChatHeader() {
  const router = useRouter();
  const { conversationId, conversations } = useChatStore();
  const title = conversations.find((c) => c.id === conversationId)?.title ?? "AI 简历顾问";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  return (
    <header className="flex items-center gap-2 px-3 py-2.5 border-b bg-white/80 backdrop-blur-xl shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => router.back()}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="我的用量"
        onClick={() => setUsageOpen(true)}
      >
        <Gauge className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="模型设置"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => router.push("/")}
      >
        <Home className="size-4" />
      </Button>

      <ModelSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <UsageDialog open={usageOpen} onOpenChange={setUsageOpen} />
    </header>
  );
}
