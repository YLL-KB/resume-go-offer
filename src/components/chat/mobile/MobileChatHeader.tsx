"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Home, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat-store";

export function MobileChatHeader() {
  const router = useRouter();
  const { conversationId, conversations } = useChatStore();
  const title = conversations.find((c) => c.id === conversationId)?.title ?? "AI 简历顾问";

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
        onClick={() => router.push("/")}
      >
        <Home className="size-4" />
      </Button>
    </header>
  );
}
