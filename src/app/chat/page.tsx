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
import { TemplateModern } from "@/components/resume/TemplateModern";
import { MessageSquare, Plus, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
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
    <div className={`group flex items-center rounded-lg text-left text-sm transition-colors hover:bg-muted ${isActive ? "bg-muted font-medium" : ""}`}>
      <Button variant="ghost" className="flex-1 justify-start gap-2 overflow-hidden px-3 py-2 h-auto min-w-0" onClick={() => { if (!editing) onSelect(); }}>
        <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
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
            <span className="truncate block">{title || "新对话"}</span>
          )}
          <p className="text-[10px] text-muted-foreground">{new Date(updatedAt).toLocaleDateString("zh-CN")}</p>
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
  const [showSidebar, setShowSidebar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── 分栏拖拽调整 ──
  const [splitRatio, setSplitRatio] = useState(50); // 左侧聊天面板宽度百分比
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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
    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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
    <div className="flex h-screen flex-col overflow-hidden bg-background print:hidden">
      <AppHeader />

      <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {showSidebar && (
        <div className="print:hidden w-64 shrink-0 border-r bg-muted/20 flex flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-medium">历史对话</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => { startNewChat(); setShowSidebar(false); }}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {conversations.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">暂无对话记录</p>
            )}
            {conversations.map((c) => (
              <ConversationItem
                key={c.id} id={c.id} title={c.title} updatedAt={c.updatedAt}
                isActive={c.id === conversationId}
                onSelect={() => { loadConversation(c.id); setShowSidebar(false); }}
                onDelete={() => setConfirmDelete({ id: c.id, title: c.title })}
                onRename={(title) => renameConversation(c.id, title)}
              />
            ))}
          </div>
        </div>
      )}

      <div
        className={`flex flex-col min-w-0 ${showPreview ? "" : "flex-1"}`}
        style={showPreview ? { width: `${splitRatio}%` } : undefined}
      >
        <ChatHeader onToggleSidebar={() => setShowSidebar(!showSidebar)} showSidebar={showSidebar} />
        {isLoadingHistory ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ChatMessages />
        )}
        <ChatInput />
      </div>

      {/* 可拖拽分界线 */}
      {showPreview && (
        <div
          className="group relative w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}

      {/* 简历预览面板 — 右侧自动填充剩余宽度 */}
      {showPreview && (
        <div className="flex-1 min-w-0">
          <ResumePreviewPanel />
        </div>
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
            <TemplateModern data={resumeData} />
          </div>
        </div>
      )}
    </div>
  );
}
