"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { useChatStore, type ResumeData } from "@/stores/chat-store";
import { Send, Square, Loader2 } from "lucide-react";

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    conversationId,
    isStreaming,
    isExtracting,
    messages,
    setConversationId,
    addMessage,
    appendToLastMessage,
    setStreaming,
    setError,
    setResumeData,
    setExtracting,
    setShowPreview,
  } = useChatStore();

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, []);

  // ── 核心发送逻辑 ──
  const sendRaw = useCallback(async (text: string) => {
    if (!text || isStreaming) return;
    setError(null);

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: text,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMsg);

    const assistantMsg = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: "",
      createdAt: new Date().toISOString(),
    };
    addMessage(assistantMsg);

    setStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
      });
      if (!response.ok) throw new Error("AI 回复失败");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (typeof parsed.content === "string") appendToLastMessage(parsed.content);
              if (parsed.conversationId && !conversationId) setConversationId(parsed.conversationId);
              if (parsed.error) setError(parsed.error);
            } catch { buffer += line + "\n"; }
          } else if (line.trim()) { buffer += line + "\n"; }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setStreaming(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isStreaming, conversationId, addMessage, appendToLastMessage, setConversationId, setStreaming, setError]);

  // ── 监听表单事件 ──
  useEffect(() => {
    const handleFormData = (e: Event) => {
      const { type, data } = (e as CustomEvent).detail;
      const labels: Record<string, string> = {
        basic: "基本信息", education: "教育经历", experience: "工作经历",
        project: "项目经验", skills: "技能标签", summary: "个人总结",
      };
      const msg = `[已填写：${labels[type] || type}]\n${JSON.stringify(data)}`;
      sendRaw(msg);
    };
    const handleFormSkip = (e: Event) => {
      const { type } = (e as CustomEvent).detail;
      const labels: Record<string, string> = {
        basic: "基本信息", education: "教育经历", experience: "工作经历",
        project: "项目经验", skills: "技能标签", summary: "个人总结",
      };
      sendRaw(`[跳过：${labels[type] || type}]`);
    };
    window.addEventListener("form-data", handleFormData);
    window.addEventListener("form-skip", handleFormSkip);
    return () => {
      window.removeEventListener("form-data", handleFormData);
      window.removeEventListener("form-skip", handleFormSkip);
    };
  }, [sendRaw]);

  // ── 用户手动发消息 ──
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendRaw(text);
  }, [input, sendRaw]);

  // 提取简历
  const handleExtract = useCallback(async () => {
    if (!conversationId || isExtracting) return;

    setExtracting(true);

    try {
      const res = await fetch("/api/chat/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "提取失败");
      }

      const json = await res.json() as { data: ResumeData };
      setResumeData(json.data);
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提取失败，请再聊几句");
    } finally {
      setExtracting(false);
    }
  }, [conversationId, isExtracting, setExtracting, setResumeData, setShowPreview, setError]);

  // 键盘事件
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="border-t bg-background px-4 py-4">
      <div className="mx-auto max-w-2xl">
        {/* 操作按钮行 */}
        {hasMessages && !isStreaming && (
          <div className="mb-3 flex justify-center">
            <button
              onClick={handleExtract}
              disabled={isExtracting}
              className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  正在生成简历...
                </>
              ) : (
                <>
                  ✨ 生成简历预览
                </>
              )}
            </button>
          </div>
        )}

        {/* 输入区 */}
        <div className="flex items-end gap-2 rounded-2xl border bg-muted/30 px-4 py-3 focus-within:border-primary/50 focus-within:bg-background transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="说说你的情况..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {isStreaming ? (
              <Square className="size-4" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </div>
  );
}
