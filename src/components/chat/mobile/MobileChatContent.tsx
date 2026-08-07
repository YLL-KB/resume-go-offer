"use client";

import { useEffect, useState } from "react";
import { MobileChatHeader } from "./MobileChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { ResumePreviewPanel } from "@/components/chat/ResumePreviewPanel";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { useChatStore } from "@/stores/chat-store";
import { Loader2 } from "lucide-react";

interface Props {
  conversationId: string | null;
}

export function MobileChatContent({ conversationId }: Props) {
  const {
    resumeData,
    isLoadingHistory,
    showPreview,
    loadConversation,
    startNewChat,
    setConversations,
  } = useChatStore();

  // 有 conversationId 时，SSR 阶段 isLoadingHistory 为 false，useEffect 还没触发，
  // 会导致短暂白屏。用本地 ready 状态桥接这个间隙。
  const [ready, setReady] = useState(!conversationId);

  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId).finally(() => setReady(true));
    } else {
      startNewChat();
    }
    fetch("/api/chat/history")
      .then((res) => res.json())
      .then((data: unknown) =>
        setConversations(
          (data as { conversations?: [] }).conversations ?? []
        )
      )
      .catch(() => {});
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !ready || isLoadingHistory;

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      <MobileChatHeader />

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatMessages />
        </div>
      )}

      {/* 简历预览全屏蒙层 */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-background">
          <ResumePreviewPanel />
        </div>
      )}

      {/* 底部输入区 — 安全区域适配 */}
      <div
        className="shrink-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ChatInput />
      </div>

      {/* 隐藏的打印模板 */}
      {resumeData && (
        <div className="hidden">
          <div className="print-resume w-[210mm] bg-white">
            <TemplateResume
              data={resumeData}
              theme={useChatStore.getState().resumeTheme}
            />
          </div>
        </div>
      )}
    </div>
  );
}
