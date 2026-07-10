"use client";

import { useEffect, useState, useRef } from "react";
import { AppHeader } from "@/components/ui/app-header";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/chat-store";
import { TemplateModern } from "@/components/resume/TemplateModern";
import { MessageSquare, Plus, Loader2, Trash2, Pencil, Check, X } from "lucide-react";

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
      <Button variant="ghost" className="flex-1 justify-start gap-2 overflow-hidden px-3 py-2 h-auto min-w-0" onClick={onSelect}>
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
  const { conversationId, resumeData, loadConversation, conversations, setConversations, startNewChat, isLoadingHistory, renameConversation, deleteConversation } = useChatStore();
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    const savedId = typeof window !== "undefined" ? localStorage.getItem("chat_conversation_id") : null;
    if (savedId) loadConversation(savedId);
    fetch("/api/chat/history")
      .then((res) => res.json())
      .then((data: unknown) => setConversations((data as { conversations?: [] }).conversations ?? []))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background print:hidden">
      <AppHeader />

      <div className="flex flex-1 overflow-hidden">
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
                onDelete={() => deleteConversation(c.id)}
                onRename={(title) => renameConversation(c.id, title)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0">
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
      </div>

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
