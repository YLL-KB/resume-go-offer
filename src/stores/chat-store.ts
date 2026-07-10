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

  // 操作
  setConversationId: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  appendToLastMessage: (content: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (err: string | null) => void;
  setResumeData: (data: Partial<ResumeData>) => void;
  setExtracting: (v: boolean) => void;
  setShowPreview: (v: boolean) => void;
  startNewChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  error: null,
  resumeData: null,
  isExtracting: false,
  showPreview: false,

  setConversationId: (id) => set({ conversationId: id }),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

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

  startNewChat: () =>
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      error: null,
      resumeData: null,
      isExtracting: false,
      showPreview: false,
    }),
}));
