"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/chat-store";
import { MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

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
    <div className={`group flex items-center rounded-lg text-left text-sm transition-colors hover:bg-slate-100/60 ${isActive ? "bg-emerald-50 font-medium" : ""}`}>
      <Button variant="ghost" className="flex-1 justify-start gap-2 overflow-hidden px-3 py-2 h-auto min-w-0 text-slate-500 hover:text-slate-900" onClick={() => { if (!editing) onSelect(); }}>
        <MessageSquare className="size-3.5 shrink-0 text-slate-300" />
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
            <span className="truncate block text-slate-900">{title || "新对话"}</span>
          )}
          <p className="text-[10px] text-slate-400">{new Date(updatedAt).toLocaleDateString("zh-CN")}</p>
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

// ── 侧边栏 Layout ──

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { conversationId, loadConversation, conversations, setConversations, startNewChat, renameConversation, deleteConversation, showPreview } = useChatStore();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // 加载对话列表
  useEffect(() => {
    fetch(`/api/chat/history?_t=${Date.now()}`)
      .then((res) => res.json())
      .then((data: unknown) => setConversations((data as { conversations?: [] }).conversations ?? []))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听 ChatContent 发出的关闭移动端侧边栏事件
  useEffect(() => {
    const handler = () => setShowMobileSidebar(false);
    window.addEventListener("chat-close-mobile-sidebar", handler);
    return () => window.removeEventListener("chat-close-mobile-sidebar", handler);
  }, []);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    try {
      const wasActive = confirmDelete.id === conversationId;
      await deleteConversation(confirmDelete.id);
      toast.success(`已删除「${confirmDelete.title || "新对话"}」`);
      if (wasActive) router.push("/chat");
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden print:hidden max-w-full" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)" }}>
      <AppHeader />

      <div className="flex flex-1 overflow-hidden">
        {/* 移动端遮罩 */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setShowMobileSidebar(false)} />
        )}

        {/* 历史对话侧边栏 */}
        <div className={`print:hidden w-60 shrink-0 border-r border-gray-200/60 bg-white/60 backdrop-blur-xl flex flex-col
          ${showMobileSidebar ? "fixed inset-y-0 left-0 z-40 w-72" : "hidden"}
          ${showPreview ? "md:hidden" : "md:relative md:flex md:z-auto md:w-60"}`}
        >
          <div className="flex items-center justify-between border-b border-gray-200/60 px-4 py-3 md:hidden">
            <span className="text-sm font-medium text-slate-900">历史对话</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setShowMobileSidebar(false)}>
              <X className="size-4" />
            </Button>
          </div>

          {/* 新对话按钮 */}
          <div className="p-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-sm text-slate-600 border-gray-200 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => { startNewChat(); router.push("/chat"); }}
            >
              <MessageSquare className="size-4" />
              新对话
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {conversations.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-slate-400">暂无对话记录</p>
            )}
            {conversations.map((c) => (
              <ConversationItem
                key={c.id} id={c.id} title={c.title} updatedAt={c.updatedAt}
                isActive={c.id === conversationId}
                onSelect={() => { loadConversation(c.id); router.push(`/chat/${c.id}`); setShowMobileSidebar(false); }}
                onDelete={() => setConfirmDelete({ id: c.id, title: c.title })}
                onRename={(title) => renameConversation(c.id, title)}
              />
            ))}
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 min-w-0 relative">
          {/* 移动端汉堡菜单按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden absolute top-2 left-3 z-10 size-8 bg-white/80 backdrop-blur border border-gray-200/60 text-slate-500"
            onClick={() => setShowMobileSidebar(true)}
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>
          {children}
        </div>
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
    </div>
  );
}
