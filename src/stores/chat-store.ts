/**
 * Chat Store — 聊天状态管理 (Zustand)
 *
 * 管理对话 ID、消息列表、流式输出状态、简历数据。
 */

import { create } from "zustand";
import { DEFAULT_RESUME_DATA, type ResumeData } from "@/lib/validators/resume.schema";

// ── 类型 ──

export type { ResumeData };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

interface ChatState {
  // 对话
  conversationId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;

  // 简历
  resumeData: ResumeData | null;
  isExtracting: boolean;
  showPreview: boolean;

  // 对话列表
  conversations: Array<{ id: string; title: string; updatedAt: string }>;
  isLoadingHistory: boolean;

  // 操作
  setConversationId: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  appendToLastMessage: (content: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (err: string | null) => void;
  setResumeData: (data: Partial<ResumeData>) => void;
  setExtracting: (v: boolean) => void;
  setShowPreview: (v: boolean) => void;
  setConversations: (list: Array<{ id: string; title: string; updatedAt: string }> | ((prev: Array<{ id: string; title: string; updatedAt: string }>) => Array<{ id: string; title: string; updatedAt: string }>)) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  startNewChat: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  error: null,
  resumeData: null,
  isExtracting: false,
  showPreview: false,
  conversations: [],
  isLoadingHistory: false,

  setConversationId: (id) => {
    set({ conversationId: id });
    if (typeof window !== "undefined") localStorage.setItem("chat_conversation_id", id);
  },

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  appendToLastMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      }
      return { messages: msgs };
    }),

  setStreaming: (v) => set({ isStreaming: v }),

  setError: (err) => set({ error: err }),

  setResumeData: (data) =>
    set({
      resumeData: {
        ...DEFAULT_RESUME_DATA,
        ...data,
        basic: { ...DEFAULT_RESUME_DATA.basic, ...(data.basic ?? {}) },
      } as ResumeData,
    }),

  setExtracting: (v) => set({ isExtracting: v }),

  setShowPreview: (v) => set({ showPreview: v }),

  setConversations: (list) => set((s) => ({ conversations: typeof list === "function" ? list(s.conversations) : list })),

  startNewChat: () => {
    if (typeof window !== "undefined") localStorage.removeItem("chat_conversation_id");
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      error: null,
      resumeData: null,
      isExtracting: false,
      showPreview: false,
    });
  },

  loadConversation: async (conversationId) => {
    set({ isLoadingHistory: true });
    try {
      const res = await fetch(`/api/chat/history?conversationId=${conversationId}`);
      const data = await res.json() as { messages: ChatMessage[] };
      set({
        messages: data.messages ?? [],
        conversationId,
        isLoadingHistory: false,
      });
      if (typeof window !== "undefined") localStorage.setItem("chat_conversation_id", conversationId);
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  renameConversation: async (id, title) => {
    await fetch(`/api/chat/history/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  deleteConversation: async (id) => {
    await fetch(`/api/chat/history/${id}`, { method: "DELETE" });
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      conversationId: s.conversationId === id ? null : s.conversationId,
      messages: s.conversationId === id ? [] : s.messages,
      showPreview: s.conversationId === id ? false : s.showPreview,
    }));
    if (get().conversationId === null && typeof window !== "undefined") {
      localStorage.removeItem("chat_conversation_id");
    }
  },
}));
