/**
 * /chat — AI 对话式简历生成器
 *
 * 用户主动聊，AI 配合引导。聊完自动生成简历预览。
 */

"use client";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { ResumePreviewPanel } from "@/components/chat/ResumePreviewPanel";
import { useChatStore } from "@/stores/chat-store";

export default function ChatPage() {
  const { showPreview } = useChatStore();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 主聊天区 */}
      <div className={`flex flex-1 flex-col min-w-0 ${showPreview ? "border-r" : ""}`}>
        <ChatHeader />
        <ChatMessages />
        <ChatInput />
      </div>

      {/* 简历预览面板 */}
      {showPreview && (
        <div className="w-[420px] shrink-0">
          <ResumePreviewPanel />
        </div>
      )}
    </div>
  );
}
