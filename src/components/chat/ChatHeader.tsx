"use client";

import { useChatStore } from "@/stores/chat-store";
import { Eye, EyeOff, Plus, LogIn, LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";

export function ChatHeader() {
  const { showPreview, setShowPreview, resumeData, startNewChat, messages } = useChatStore();

  const hasResume = resumeData !== null;
  const hasStarted = messages.length > 0;

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold">简历顾问</h1>
        {hasStarted && (
          <button
            onClick={startNewChat}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            <Plus className="size-3" />
            新对话
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* 预览按钮 */}
        {hasResume && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              showPreview
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {showPreview ? (
              <>
                <EyeOff className="size-3.5" />
                收起预览
              </>
            ) : (
              <>
                <Eye className="size-3.5" />
                查看简历
              </>
            )}
          </button>
        )}

        {/* 登录按钮 */}
        <a
          href="/login"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <LogIn className="size-3.5" />
          登录
        </a>
      </div>
    </header>
  );
}
