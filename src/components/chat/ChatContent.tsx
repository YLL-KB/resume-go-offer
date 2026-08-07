"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { useChatStore } from "@/stores/chat-store";
import { ResumePreviewPanel } from "@/components/chat/ResumePreviewPanel";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { Loader2, Sparkles, FileText, Briefcase, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── 新用户引导 ──

const ONBOARDING_KEY = "rgo_onboarded";

interface PromptCard {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  prompt: string;
  color: string;
}

const EXAMPLE_PROMPTS: PromptCard[] = [
  {
    icon: FileText,
    title: "新建简历",
    desc: "从零生成一份专业简历",
    prompt: "帮我写一份前端工程师的简历，我有 3 年工作经验，熟悉 React 和 TypeScript",
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
  },
  {
    icon: RefreshCw,
    title: "优化简历",
    desc: "改进已有简历的内容",
    prompt: "帮我优化一下我的简历，让工作经历更有亮点和成果导向",
    color: "bg-blue-50 text-blue-600 border-blue-200",
  },
  {
    icon: Briefcase,
    title: "换行建议",
    desc: "转行或转岗的简历策略",
    prompt: "我是后端工程师想转前端，帮我改写简历突出相关项目经验",
    color: "bg-purple-50 text-purple-600 border-purple-200",
  },
];

function OnboardingPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem(ONBOARDING_KEY);
  });
  const [dismissed, setDismissed] = useState(false);

  // 移动端 5 秒后自动收起
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    const timer = setTimeout(() => setDismissed(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6 hidden sm:block">
      <div className="rounded-2xl border border-slate-200 bg-white/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Sparkles className="size-4 text-emerald-500" />
            试试这些
          </h3>
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-xs text-slate-400 hover:text-slate-600 h-auto p-0">
            不再显示
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {EXAMPLE_PROMPTS.map((item) => (
            <Button
              key={item.title}
              variant="ghost"
              onClick={() => { onSelect(item.prompt); setDismissed(true); }}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all hover:shadow-sm h-auto ${item.color}`}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="text-sm font-medium">{item.title}</span>
              <span className="text-xs text-slate-500 line-clamp-2">{item.desc}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 聊天主体 ──

export function ChatContent({ conversationId }: { conversationId: string | null }) {
  const { resumeData, messages, isStreaming, isExtracting, loadConversation, setConversations, startNewChat, isLoadingHistory, showPreview, triggerQuickSend } = useChatStore();

  // 桥接 SSR 到 useEffect 之间的间隙
  const [ready, setReady] = useState(!conversationId);

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
      startNewChat();
    }
    fetch("/api/chat/history")
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
              {!conversationId && messages.length <= 1 && !isStreaming && !isExtracting && (
                <OnboardingPrompts onSelect={(p) => triggerQuickSend(p)} />
              )}
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
