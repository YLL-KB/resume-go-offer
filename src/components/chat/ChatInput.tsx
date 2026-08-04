"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { useChatStore, type ResumeData } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, Loader2, X, Quote } from "lucide-react";
import { randomUUID } from "@/lib/utils/uuid";

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    conversationId,
    isStreaming,
    isExtracting,
    messages,
    resumeData,
    quoteText,
    setConversationId,
    addMessage,
    appendToLastMessage,
    setStreaming,
    setError,
    setResumeData,
    setExtracting,
    setExtractStreamText,
    appendExtractStreamText,
    setShowPreview,
    setConversations,
    setQuoteText,
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
      id: randomUUID(),
      role: "user" as const,
      content: text,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMsg);

    const assistantMsg = {
      id: randomUUID(),
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
              if (parsed.title && conversationId) {
                setConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, title: parsed.title as string } : c));
              }
              if (parsed.error) setError(parsed.error);
              // LangGraph: tool call 事件 → 触发前端行为
              if (parsed.tool_call?.name === "pushForm") {
                window.dispatchEvent(new CustomEvent("tool-push-form", {
                  detail: { type: parsed.tool_call.args.type as string },
                }));
              }
              // LangGraph: 简历提取结果
              if (parsed.resumeData) {
                setResumeData(parsed.resumeData as Partial<ResumeData>);
                setShowPreview(true);
              }
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
  }, [isStreaming, conversationId, addMessage, appendToLastMessage, setConversationId, setConversations, setStreaming, setError]);

  // ── 监听表单事件 ──
  useEffect(() => {
    const handleFormData = (e: Event) => {
      const { type, data } = (e as CustomEvent).detail;
      const labels: Record<string, string> = {
        basic: "基本信息", education: "教育经历", experience: "工作经历",
        project: "项目经验", skills: "技能标签", summary: "个人总结",
      };

      // 直接写入 store，确保表单数据不丢失
      const current = useChatStore.getState().resumeData ?? { basic: {}, education: [], experience: [], projects: [], skills: [], summary: "" };
      const merged = { ...current as Record<string, unknown> };

      if (type === "basic") {
        merged.basic = { ...(current.basic as Record<string, unknown> ?? {}), ...data };
      } else if (type === "education") {
        // 支持多条教育经历：表单提交 { entries: [...] }，也兼容旧的单条格式
        const newEntries = Array.isArray(data.entries) ? data.entries : [data];
        merged.education = [...((current.education as unknown[]) ?? []), ...newEntries];
      } else if (type === "experience") {
        const newEntries = Array.isArray(data.entries) ? data.entries : [data];
        merged.experience = [...((current.experience as unknown[]) ?? []), ...newEntries];
      } else if (type === "project") {
        const newEntries = Array.isArray(data.entries) ? data.entries : [data];
        merged.projects = [...((current.projects as unknown[]) ?? []), ...newEntries];
      } else if (type === "skills") {
        merged.skills = data.skills ?? [];
      } else if (type === "summary") {
        merged.summary = data.summary ?? "";
      }
      setResumeData(merged as Partial<ResumeData>);

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

  // 引用后自动 focus
  useEffect(() => {
    if (quoteText) {
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [quoteText]);

  // ── 用户手动发消息 ──
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    // 有引用时，把引用内容拼到消息前面
    const fullText = quoteText ? `> "${quoteText}"\n\n${text}` : text;
    setQuoteText(null);
    await sendRaw(fullText);
  }, [input, sendRaw, quoteText, setQuoteText]);

  // 提取简历（SSE 流式）
  const handleExtract = useCallback(async () => {
    if (!conversationId || isExtracting) return;

    setExtracting(true);
    setError(null);
    setExtractStreamText("");

    try {
      const { readExtractSSE } = await import("@/lib/utils/sse");
      const res = await fetch("/api/chat/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await readExtractSSE(res, (chunk) => {
        appendExtractStreamText(chunk);
      });
      if (!data) throw new Error("提取失败，请再聊几句");

      setResumeData(data as ResumeData);
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提取失败，请再聊几句");
    } finally {
      setExtracting(false);
    }
  }, [conversationId, isExtracting, setExtracting, setResumeData, setShowPreview, setError, appendExtractStreamText]);

  // 键盘事件
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 输入法组合中（如中文拼音选词），不触发发送
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasMessages = messages.filter(m => m.role === "user").length > 0;

  return (
    <div className="print:hidden border-t bg-background px-4 py-4">
      <div className="mx-auto max-w-2xl">
        {/* 操作按钮行 */}
        {hasMessages && !isStreaming && (
          <div className="mb-3 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleExtract}
              disabled={isExtracting}
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
            </Button>
          </div>
        )}

        {/* 引用条 */}
        {quoteText && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs sm:text-sm">
            <Quote className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-muted-foreground">{quoteText}</span>
            <button
              onClick={() => setQuoteText(null)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* 输入区 */}
        <div className="flex items-end gap-2 rounded-2xl border bg-muted/30 px-4 py-3 focus-within:border-primary/50 focus-within:bg-background transition-colors">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustHeight(); }}
            onKeyDown={handleKeyDown}
            placeholder="说说你的情况..."
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? <Square className="size-4" /> : <Send className="size-4" />}
          </Button>
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </div>
  );
}
