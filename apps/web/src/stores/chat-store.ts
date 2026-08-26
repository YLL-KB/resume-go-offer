/**
 * Chat Store — 聊天状态管理 (Zustand)
 *
 * 管理对话 ID、消息列表、流式输出状态、简历数据。
 */

import { create } from "zustand";
import { DEFAULT_RESUME_DATA, type ResumeData } from "@/lib/validators/resume.schema";
import { GREETING_NEW_USER } from "@/lib/ai/prompts";
import { randomUUID } from "@/lib/utils/uuid";

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
  parsingAttachment: boolean;
  error: string | null;

  // 简历
  resumeData: ResumeData | null;
  // 示例简历（demo）预览数据——独立于 resumeData，避免虚构数据污染用户真实简历
  previewData: ResumeData | null;
  skillsHtmlMap: Record<string, string> | null;
  isExtracting: boolean;
  extractStreamText: string;
  showPreview: boolean;
  resumeTheme: import("@/components/resume/TemplateResume").ResumeTheme;
  setResumeTheme: (theme: import("@/components/resume/TemplateResume").ResumeTheme) => void;

  // 对话列表
  conversations: Array<{ id: string; title: string; updatedAt: string }>;
  isLoadingHistory: boolean;

  // 引用追问
  quoteText: string | null;
  setQuoteText: (text: string | null) => void;

  // 重新生成
  regeneratePrompt: string | null;
  triggerRegenerate: (prompt: string) => void;
  clearRegenerate: () => void;

  // 快捷发送（Onboarding 等场景）
  quickSend: string | null;
  triggerQuickSend: (prompt: string) => void;
  clearQuickSend: () => void;

  // 操作
  setConversationId: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  appendToLastMessage: (content: string) => void;
  clearLastAssistantMessage: () => void;
  setStreaming: (v: boolean) => void;
  setParsingAttachment: (v: boolean) => void;
  setError: (err: string | null) => void;
  setResumeData: (data: Partial<ResumeData>) => void;
  setPreviewData: (data: ResumeData | null) => void;
  loadResumeDraft: () => void;
  clearResumeDraft: () => void;
  setSkillsHtmlMap: (map: Record<string, string> | null) => void;
  setExtracting: (v: boolean) => void;
  setExtractStreamText: (text: string) => void;
  appendExtractStreamText: (chunk: string) => void;
  setShowPreview: (v: boolean) => void;
  setConversations: (list: Array<{ id: string; title: string; updatedAt: string }> | ((prev: Array<{ id: string; title: string; updatedAt: string }>) => Array<{ id: string; title: string; updatedAt: string }>)) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  startNewChat: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
  stop: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  parsingAttachment: false,
  error: null,
  resumeData: null,
  previewData: null,
  skillsHtmlMap: null,
  isExtracting: false,
  extractStreamText: "",
  showPreview: false,
  resumeTheme: "ocean",
  setResumeTheme: (theme) => set({ resumeTheme: theme }),
  conversations: [],
  isLoadingHistory: false,
  quoteText: null,
  regeneratePrompt: null,
  quickSend: null,

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

  clearLastAssistantMessage: () =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: "" };
      }
      return { messages: msgs };
    }),

  setStreaming: (v) => set({ isStreaming: v }),

  setParsingAttachment: (v) => set({ parsingAttachment: v }),

  setError: (err) => set({ error: err }),

  setResumeData: (data) =>
    set((s) => {
      const merged = {
        ...DEFAULT_RESUME_DATA,
        ...s.resumeData,
        ...data,
        basic: { ...DEFAULT_RESUME_DATA.basic, ...(s.resumeData?.basic ?? {}), ...(data.basic ?? {}) },
      } as ResumeData;
      // 自动保存草稿到 localStorage
      if (typeof window !== "undefined") {
        try { localStorage.setItem("resume_draft", JSON.stringify(merged)); } catch { /* quota exceeded */ }
      }
      return { resumeData: merged, previewData: null, skillsHtmlMap: null };
    }),

  setPreviewData: (data) => set({ previewData: data, skillsHtmlMap: null }),

  loadResumeDraft: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("resume_draft");
      if (raw) {
        const data = JSON.parse(raw) as ResumeData;
        set({ resumeData: data });
      }
    } catch { /* corrupted */ }
  },

  clearResumeDraft: () => {
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("resume_draft"); } catch { /* ignore */ }
    }
  },

  setSkillsHtmlMap: (map) => set({ skillsHtmlMap: map }),

  setExtracting: (v) => set({ isExtracting: v, ...(v ? {} : { extractStreamText: "" }) }),

  setExtractStreamText: (text) => set({ extractStreamText: text }),

  appendExtractStreamText: (chunk) => set((s) => ({ extractStreamText: s.extractStreamText + chunk })),

  setShowPreview: (v) => set({ showPreview: v }),

  setQuoteText: (text) => set({ quoteText: text }),

  triggerRegenerate: (prompt) => set({ regeneratePrompt: prompt }),
  clearRegenerate: () => set({ regeneratePrompt: null }),

  triggerQuickSend: (prompt) => set({ quickSend: prompt }),
  clearQuickSend: () => set({ quickSend: null }),

  setConversations: (list) => set((s) => ({ conversations: typeof list === "function" ? list(s.conversations) : list })),

  startNewChat: () => {
    if (typeof window !== "undefined") localStorage.removeItem("chat_conversation_id");
    set({
      conversationId: null,
      messages: [{
        id: randomUUID(),
        role: "assistant" as const,
        content: GREETING_NEW_USER,
        createdAt: new Date().toISOString(),
      }],
      isStreaming: false,
      error: null,
      resumeData: null,
      previewData: null,
      skillsHtmlMap: null,
      isExtracting: false,
      extractStreamText: "",
      showPreview: false,
    });
  },

  stop: () => set({ isStreaming: false }),

  loadConversation: async (conversationId) => {
    set({
      isLoadingHistory: true,
      isStreaming: false,
      isExtracting: false,
      extractStreamText: "",
      resumeData: null,
      previewData: null,
      skillsHtmlMap: null,
      showPreview: false,
      error: null,
      quoteText: null,
      regeneratePrompt: null,
      quickSend: null,
    });
    try {
      const res = await fetch(`/api/chat/history?conversationId=${conversationId}`);
      const data = await res.json() as { messages: ChatMessage[] };
      const dbMessages = data.messages ?? [];
      // Only prepend fallback greeting for old conversations that lack one
      const hasGreeting = dbMessages.length > 0 && dbMessages[0].role === "assistant";
      const displayMessages = (!hasGreeting && dbMessages.length > 0)
        ? [{
            id: `greeting-${conversationId}`,
            role: "assistant" as const,
            content: GREETING_NEW_USER,
            createdAt: dbMessages[0].createdAt,
          }, ...dbMessages]
        : dbMessages;
      set({
        messages: displayMessages,
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
    const res = await fetch(`/api/chat/history/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("删除失败");
    const wasActive = get().conversationId === id;
    set({
      conversationId: wasActive ? null : get().conversationId,
      messages: wasActive ? [] : get().messages,
      showPreview: wasActive ? false : get().showPreview,
    });
    if (wasActive && typeof window !== "undefined") {
      localStorage.removeItem("chat_conversation_id");
    }
    // 重新拉列表确保数据一致，不走浏览器缓存
    try {
      const listRes = await fetch(`/api/chat/history?_t=${Date.now()}`);
      const data = await listRes.json() as { conversations?: Array<{ id: string; title: string; updatedAt: string }> };
      if (data.conversations) {
        set({ conversations: data.conversations });
      }
    } catch { /* 重新获取失败不影响已完成的删除 */ }
  },

  deleteMessage: async (id) => {
    const prev = get().messages;
    const idx = prev.findIndex((m) => m.id === id);
    if (idx === -1) return;

    const msg = prev[idx];
    const idsToDelete: string[] = [id];

    // 找到配对的另一条消息一起删
    if (msg.role === "user") {
      // 用户消息 → 同时删 AI 的回复（后面第一条非 system 消息）
      const next = prev.slice(idx + 1).find((m) => m.role !== "system");
      if (next && next.role === "assistant") idsToDelete.push(next.id);
    } else if (msg.role === "assistant") {
      // AI 消息 → 同时删用户的问题（前面最后一条非 system 消息）
      const prevMsgs = prev.slice(0, idx).reverse();
      const prevMsg = prevMsgs.find((m) => m.role !== "system");
      if (prevMsg && prevMsg.role === "user") idsToDelete.push(prevMsg.id);
    }

    set((s) => ({ messages: s.messages.filter((m) => !idsToDelete.includes(m.id)) }));

    try {
      await Promise.all(idsToDelete.map((did) => fetch(`/api/chat/messages/${did}`, { method: "DELETE" })));
    } catch {
      set({ messages: prev });
    }
  },
}));
