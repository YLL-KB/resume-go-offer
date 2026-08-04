"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/chat-store";
import { ResumePreviewPanel } from "@/components/chat/ResumePreviewPanel";
import { TemplateResume } from "@/components/resume/TemplateResume";
import { MessageSquare, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// ── 对话列表项 ──

function ConversationItem({
  title, updatedAt, isActive, onSelect, onDelete, onRename,
}: {
  id: string; title: string; updatedAt: string; isActive: boolean;
  onSelect: () => void; onDelete: () => void; onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    else setName(title);
    setEditing(false);
  };

  return (
    <div className={`group flex items-center rounded-lg text-left text-sm transition-colors hover:bg-[#f5f0e8] ${isActive ? "bg-[#e8e0d5]/60 font-medium" : ""}`}>
      <Button variant="ghost" className="flex-1 justify-start gap-2 overflow-hidden px-3 py-2 h-auto min-w-0 text-[#6b6859] hover:text-[#3d3929]" onClick={() => { if (!editing) onSelect(); }}>
        <MessageSquare className="size-3.5 shrink-0 text-[#d4c5a9]" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setName(title); setEditing(false); } }}
              onClick={(e) => e.stopPropagation()}
              className="h-6 text-sm"
            />
          ) : (
            <span className="truncate block text-[#3d3929]">{title || "新对话"}</span>
          )}
          <p className="text-[10px] text-[#9b9879]">{new Date(updatedAt).toLocaleDateString("zh-CN")}</p>
        </div>
      </Button>

      <div className="hidden group-hover:flex items-center gap-0.5 pr-2 shrink-0">
        {editing ? (
          <>
            <Button variant="ghost" size="icon" className="size-6" onClick={handleSave}><Check className="size-3" /></Button>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => { setName(title); setEditing(false); }}><X className="size-3" /></Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }}><Pencil className="size-3" /></Button>
            <Button variant="ghost" size="icon" className="size-6" onClick={onDelete}><Trash2 className="size-3 text-destructive" /></Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── 主页面 ──

export default function ChatPage() {
  const { conversationId, resumeData, loadConversation, conversations, setConversations, startNewChat, isLoadingHistory, renameConversation, deleteConversation, showPreview } = useChatStore();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // ── 移动端检测 ──
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── 分栏拖拽调整 ──
  const [splitRatio, setSplitRatio] = useState(50); // 左侧聊天面板宽度百分比
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // ── 重置拖拽状态（内联样式的清理必须始终执行，否则 body 上的 userSelect=none 会阻止文本选择/复制）──
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
      setSplitRatio(Math.min(Math.max(pct, 30), 70)); // 限制 30% ~ 70%
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", resetDragState);
    // 安全网：鼠标离开文档 / 窗口失焦时强制重置，防止 body 上残留 userSelect=none
    document.addEventListener("mouseleave", resetDragState);
    window.addEventListener("blur", resetDragState);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", resetDragState);
      document.removeEventListener("mouseleave", resetDragState);
      window.removeEventListener("blur", resetDragState);
      // 组件卸载时兜底清理
      resetDragState();
    };
  }, [resetDragState]);

  useEffect(() => {
    const savedId = typeof window !== "undefined" ? localStorage.getItem("chat_conversation_id") : null;
    if (savedId) {
      loadConversation(savedId);
    } else {
      // 首次访问：AI 主动打招呼
      startNewChat();
    }
    fetch("/api/chat/history")
      .then((res) => res.json())
      .then((data: unknown) => setConversations((data as { conversations?: [] }).conversations ?? []))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 生成简历预览后自动收起移动端侧边栏
  useEffect(() => {
    if (showPreview) setShowMobileSidebar(false);
  }, [showPreview]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    try {
      await deleteConversation(confirmDelete.id);
      toast.success(`已删除「${confirmDelete.title || "新对话"}」`);
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#faf7f2] print:hidden">
      <AppHeader variant="light" />

      <ChatHeader onToggleSidebar={() => setShowMobileSidebar(true)} />

      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* 移动端遮罩 */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setShowMobileSidebar(false)} />
        )}

        {/* 历史对话侧边栏 */}
        {/* 移动端：fixed overlay；桌面端：生成预览后自动收起，留更多空间给简历 */}
        <div className={`print:hidden w-60 shrink-0 border-r border-[#e8e0d5] bg-[#faf7f2]/60 backdrop-blur-xl flex flex-col
          ${showMobileSidebar ? "fixed inset-y-0 left-0 z-40 w-72" : "hidden"}
          ${showPreview ? "md:hidden" : "md:relative md:flex md:z-auto md:w-60"}`}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 md:hidden">
            <span className="text-sm font-medium text-[#3d3929]">历史对话</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setShowMobileSidebar(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {conversations.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-[#9b9879]">暂无对话记录</p>
            )}
            {conversations.map((c) => (
              <ConversationItem
                key={c.id} id={c.id} title={c.title} updatedAt={c.updatedAt}
                isActive={c.id === conversationId}
                onSelect={() => { loadConversation(c.id); setShowMobileSidebar(false); }}
                onDelete={() => setConfirmDelete({ id: c.id, title: c.title })}
                onRename={(title) => renameConversation(c.id, title)}
              />
            ))}
          </div>
        </div>

        {/* 聊天区 */}
        <div
          className={`flex flex-col min-w-0 flex-1 ${showPreview ? "md:flex-initial" : ""}`}
          style={showPreview && isDesktop ? { width: `${splitRatio}%` } : undefined}
        >
          {isLoadingHistory ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-[#d4c5a9]" />
            </div>
          ) : (
            <ChatMessages />
          )}
          <ChatInput />
        </div>

        {/* 可拖拽分界线 — 仅桌面端 */}
        {showPreview && (
          <div
            className="hidden md:block group relative w-1.5 shrink-0 cursor-col-resize bg-[#e8e0d5] hover:bg-[#4a7c59]/30 transition-colors"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}

        {/* 简历预览面板 */}
        {/* 桌面端：右侧并排；移动端：全屏 overlay */}
        {showPreview && (
          <>
            {/* 桌面端 */}
            <div className="hidden md:flex flex-1 min-w-0">
              <ResumePreviewPanel />
            </div>
            {/* 移动端 overlay */}
            <div className="md:hidden fixed inset-0 z-50 bg-background">
              <ResumePreviewPanel />
            </div>
          </>
        )}
      </div>

      {/* 删除确认对话框 */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除对话「{confirmDelete?.title || "新对话"}」吗？此操作不可撤销，对话中的所有消息将被永久删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>取消</Button>
            <Button variant="destructive" disabled={deletingId === confirmDelete?.id} onClick={handleDelete}>
              {deletingId === confirmDelete?.id ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Trash2 className="mr-1.5 size-4" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resumeData && (
        <div className="hidden">
          <div className="print-resume w-[210mm] min-h-[297mm] bg-white">
            <TemplateResume data={resumeData} />
          </div>
        </div>
      )}
    </div>
  );
}
