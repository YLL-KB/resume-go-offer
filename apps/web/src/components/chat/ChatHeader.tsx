"use client";

import { useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@resume/ui";
import { Plus, Menu, Sparkles, Settings2 } from "lucide-react";
import { toast } from "sonner";

export function ChatHeader({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const router = useRouter();
  const { startNewChat, messages } = useChatStore();
  const hasStarted = messages.length > 0;

  const handleNewChat = async () => {
    try {
      const res = await fetch("/api/chat/quota");
      if (res.ok) {
        const q = (await res.json()) as { allowed?: boolean; code?: string; reason?: string };
        if (q.allowed === false) {
          const isAnon = q.code === "ANON_TIER_EXCEEDED";
          toast.error(q.reason ?? "免费对话额度已用完", {
            action: {
              label: isAnon ? "去登录" : "去设置",
              onClick: () => { window.location.href = isAnon ? "/login" : "/settings"; },
            },
          });
          return;
        }
      }
    } catch { /* 接口异常放行，交给发送时的额度拦截兜底 */ }
    startNewChat();
    router.push("/chat");
  };

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
            onClick={handleNewChat}
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
          title="设置"
          onClick={() => router.push("/settings")}
        >
          <Settings2 className="size-4" />
        </Button>
      </div>
    </header>
  );
}
