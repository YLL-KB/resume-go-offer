"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { useChatStore } from "@/stores/chat-store";
import { ResumePreviewPanel } from "@/components/chat/ResumePreviewPanel";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { getResume } from "@/lib/api/resume";
import { resumeDataToText } from "@/lib/utils/resume-text";
import { Loader2 } from "lucide-react";
// ── 聊天主体 ──

export function ChatContent({
  conversationId,
  resumeId,
}: {
  conversationId: string | null;
  /** 从「我的简历」引用进入：预载该简历 + 快捷发送优化请求 */
  resumeId?: string | null;
}) {
  const { resumeData, loadConversation, setConversations, startNewChat, isLoadingHistory, showPreview, setResumeData, setShowPreview, triggerQuickSend } = useChatStore();

  const [ready, setReady] = useState(false);
  const seededRef = useRef(false);

  // ── 移动端检测 ──
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── 分栏拖拽调整 ──
  const [splitRatio, setSplitRatio] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const resetDragState = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      setSplitRatio(Math.min(Math.max(pct, 30), 70));
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", resetDragState);
    document.addEventListener("mouseleave", resetDragState);
    window.addEventListener("blur", resetDragState);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", resetDragState);
      document.removeEventListener("mouseleave", resetDragState);
      window.removeEventListener("blur", resetDragState);
      resetDragState();
    };
  }, [resetDragState]);

  // ── 加载对话 ──
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId).finally(() => setReady(true));
    } else {
      startNewChat(); // 静态兜底问候语
      setReady(true);

      // 从「我的简历」引用进入：预载简历数据 + 展示预览 + 快捷发送优化请求
      if (resumeId && !seededRef.current) {
        seededRef.current = true;
        (async () => {
          try {
            const detail = await getResume(resumeId);
            if (!detail.data) return;
            setResumeData(detail.data as Parameters<typeof setResumeData>[0]);
            setShowPreview(true);
            // 复用上传简历文件的标记：router 会分到 advising，提取规则 0.5 也会直接采纳这份数据
            triggerQuickSend(
              `[用户上传了简历文件]\n\n${resumeDataToText(detail.data, detail.title)}\n\n这是我当前的简历，帮我看看整体有哪些可以优化的地方。`,
            );
            window.history.replaceState(null, "", "/chat");
          } catch {
            window.history.replaceState(null, "", "/chat");
          }
        })();
      }
    }
    fetch(`/api/chat/history?_t=${Date.now()}`)
      .then((res) => res.json())
      .then((data: unknown) => setConversations((data as { conversations?: [] }).conversations ?? []))
      .catch(() => {});
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 简历预览打开时自动收起移动端侧边栏
  const prevShowPreview = useRef(showPreview);
  useEffect(() => {
    if (showPreview && !prevShowPreview.current) {
      const event = new CustomEvent("chat-close-mobile-sidebar");
      window.dispatchEvent(event);
    }
    prevShowPreview.current = showPreview;
  }, [showPreview]);

  const loading = !ready || isLoadingHistory;

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)" }}>
      <ChatHeader />

      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* 聊天区 */}
        <div
          className={`flex flex-col min-w-0 flex-1 ${showPreview ? "md:flex-initial" : ""}`}
          style={showPreview && isDesktop ? { width: `${splitRatio}%` } : undefined}
        >
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-300" />
            </div>
          ) : (
            <>
              <ChatMessages />
            </>
          )}
          <ChatInput />
        </div>

        {/* 可拖拽分界线 — 仅桌面端 */}
        {showPreview && (
          <div
            className="hidden md:block group relative w-1.5 shrink-0 cursor-col-resize bg-gray-200 hover:bg-emerald-300/50 transition-colors"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}

        {/* 简历预览面板 */}
        {showPreview && (
          <>
            <div className="hidden md:flex flex-1 min-w-0">
              <ResumePreviewPanel />
            </div>
            <div className="md:hidden fixed inset-0 z-50 bg-background">
              <ResumePreviewPanel />
            </div>
          </>
        )}
      </div>

      {resumeData && (
        <div className="hidden">
          <div className="print-resume w-[210mm] bg-white">
            <TemplateResume data={resumeData} theme={useChatStore.getState().resumeTheme} />
          </div>
        </div>
      )}
    </div>
  );
}
