"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore, type ChatMessage as ChatMessageType } from "@/stores/chat-store";
import { FormCard, type FormType } from "./FormCard";
import { marked } from "marked";
import { User, Bot, Copy, Check, Quote, TextSelect } from "lucide-react";

// ── 解析消息中的表单标记 ──

const FORM_REGEX = /\[FORM:(basic|education|experience|project|skills|summary|done)\]/g;

function parseForms(content: string): { text: string; forms: FormType[] } {
  const forms: FormType[] = [];
  const text = content.replace(FORM_REGEX, (_, type) => {
    if (type === "done") return "";
    forms.push(type as FormType);
    return "";
  });
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), forms };
}

// ── 单条消息气泡 ──

function ChatBubble({ msg, formMessages }: { msg: ChatMessageType; formMessages: Map<string, { type: FormType; submitted?: boolean }> }) {
  const isUser = msg.role === "user";
  const { text, forms } = parseForms(msg.content);
  const [copied, setCopied] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const setQuoteText = useChatStore((s) => s.setQuoteText);

  // ── 选中引用 ──
  const [selectionPopup, setSelectionPopup] = useState<{ text: string; x: number; y: number } | null>(null);

  const showSelectionPopup = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionPopup(null);
        return;
      }
      const bubbleEl = bubbleRef.current;
      if (!bubbleEl) return;
      try {
        const range = sel.getRangeAt(0);
        if (!bubbleEl.contains(range.commonAncestorContainer)) {
          setSelectionPopup(null);
          return;
        }
        const rect = range.getBoundingClientRect();
        setSelectionPopup({
          text: sel.toString().trim(),
          x: Math.min(rect.left + rect.width / 2, window.innerWidth - 80),
          y: rect.bottom + 6,
        });
      } catch {
        setSelectionPopup(null);
      }
    }, 0);
  }, []);

  const handleMouseUp = showSelectionPopup;
  const handleTouchEnd = showSelectionPopup;

  // 移动端「选择文本」：全选气泡文字并弹出引用
  const handleSelectText = useCallback(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(contentEl);
    sel.removeAllRanges();
    sel.addRange(range);
    showSelectionPopup();
  }, [showSelectionPopup]);

  // 点击外部关闭引用弹窗
  useEffect(() => {
    if (!selectionPopup) return;
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-quote-popup]")) return;
      setSelectionPopup(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [selectionPopup]);

  const handleQuote = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionPopup) {
      setQuoteText(selectionPopup.text);
      setSelectionPopup(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [selectionPopup, setQuoteText]);

  const handleCopy = useCallback(async () => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = marked.parse(text, { async: false }) as string;
    const plainText = tempDiv.textContent ?? tempDiv.innerText ?? text;
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const handleQuoteFull = useCallback(() => {
    // 引用整条消息的纯文本
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = marked.parse(text, { async: false }) as string;
    const plainText = (tempDiv.textContent ?? tempDiv.innerText ?? text).trim();
    setQuoteText(plainText);
  }, [text, setQuoteText]);

  const hasContent = text.length > 0 || forms.length > 0;
  if (!hasContent) return null;

  return (
    <div className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div ref={bubbleRef} className={`max-w-[85%] md:max-w-[80%] space-y-3 ${isUser ? "items-end" : "min-w-0"}`}>
        {text && (
          <div>
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
              onMouseUp={!isUser ? handleMouseUp : undefined}
              onTouchEnd={!isUser ? handleTouchEnd : undefined}
            >
              <div
                ref={contentRef}
                className={`md-content select-text ${isUser ? "[&_strong]:text-primary-foreground [&_code]:bg-white/20" : ""}`}
                dangerouslySetInnerHTML={{ __html: marked.parse(text, { async: false }) as string }}
              />
            </div>

            {/* 底部操作栏 — 移动端始终显示，桌面端 hover 显示 */}
            {!isUser && (
              <div className="flex items-center gap-1 mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="复制"
                >
                  {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                  {copied ? "已复制" : "复制"}
                </button>
                <button
                  onClick={handleQuoteFull}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="引用追问"
                >
                  <Quote className="size-3" />
                  引用
                </button>
                {/* 移动端专属：选择文本 */}
                <button
                  onClick={handleSelectText}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:hidden"
                  title="选择文本"
                >
                  <TextSelect className="size-3" />
                  选择文本
                </button>
              </div>
            )}
          </div>
        )}

        {forms.map((type, i) => {
          const key = `${msg.id}-${type}-${i}`;
          const state = formMessages.get(key);
          if (state?.submitted) return null;
          return (
            <FormCard
              key={key}
              type={type}
              onSubmit={(_t, data) =>
                window.dispatchEvent(new CustomEvent("form-submit", { detail: { type, data, formKey: key } }))}
              onCancel={() =>
                window.dispatchEvent(new CustomEvent("form-cancel", { detail: { type, formKey: key } }))}
            />
          );
        })}
      </div>

      {/* 浮动引用按钮 */}
      {selectionPopup && (
        <div
          data-quote-popup
          className="fixed z-50"
          style={{ left: selectionPopup.x, top: selectionPopup.y, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onClick={handleQuote}
            onMouseDown={(e) => e.preventDefault()}
            className="flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium shadow-md hover:bg-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
            引用追问
          </button>
        </div>
      )}
    </div>
  );
}

// ── 打字指示器 ──

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="size-4" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-4">
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: "0ms" }} />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: "150ms" }} />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

// ── 消息列表 ──

export function ChatMessages() {
  const { messages, isStreaming, setShowPreview, setResumeData, setExtracting, conversationId } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [formState] = useState<Map<string, { type: FormType; submitted?: boolean }>>(new Map());
  // LangGraph: tool-push-form 事件触发的表单
  const [toolForms, setToolForms] = useState<Array<{ key: string; type: FormType }>>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // 监听表单事件
  useEffect(() => {
    const handleSubmit = (e: Event) => {
      const { type, data, formKey } = (e as CustomEvent).detail;
      formState.set(formKey, { type, submitted: true });
      window.dispatchEvent(new CustomEvent("form-data", { detail: { type, data } }));
    };
    const handleCancel = (e: Event) => {
      const { formKey, type } = (e as CustomEvent).detail;
      formState.set(formKey, { type, submitted: true });
      window.dispatchEvent(new CustomEvent("form-skip", { detail: { type } }));
    };
    const handleDone = () => {
      if (conversationId) {
        setExtracting(true);
        fetch("/api/chat/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        })
          .then(async (res) => {
            const json = await res.json() as { data?: Record<string, unknown> };
            if (json.data) { setResumeData(json.data); setShowPreview(true); }
          })
          .catch(console.error)
          .finally(() => setExtracting(false));
      }
    };

    // LangGraph: tool-push-form 事件 → 展示表单卡片
    const handleToolPushForm = (e: Event) => {
      const { type } = (e as CustomEvent).detail as { type: string };
      const key = `tool-${type}-${Date.now()}`;
      setToolForms((prev) => [...prev, { key, type: type as FormType }]);
    };

    window.addEventListener("form-submit", handleSubmit);
    window.addEventListener("form-cancel", handleCancel);
    window.addEventListener("form-done", handleDone);
    window.addEventListener("tool-push-form", handleToolPushForm);
    return () => {
      window.removeEventListener("form-submit", handleSubmit);
      window.removeEventListener("form-cancel", handleCancel);
      window.removeEventListener("form-done", handleDone);
      window.removeEventListener("tool-push-form", handleToolPushForm);
    };
  }, [conversationId, setExtracting, setResumeData, setShowPreview, formState]);

  const lastMsg = messages[messages.length - 1];
  const hasFormDone = lastMsg?.role === "assistant" && /\[FORM:done\]/.test(lastMsg.content);

  // 检测到 [FORM:done] 自动提取简历并展示预览
  const lastDoneRef = useRef<string | null>(null);
  const storeResumeData = useChatStore((s) => s.resumeData);
  useEffect(() => {
    if (hasFormDone && conversationId && lastDoneRef.current !== lastMsg.id) {
      lastDoneRef.current = lastMsg.id;
      setExtracting(true);
      fetch("/api/chat/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      })
        .then(async (res) => {
          const json = await res.json() as { data?: Record<string, unknown> };
          if (json.data) {
            // 合并：AI 提取的数据优先（AI 有完整对话上下文 + 优化建议），表单数据补充填充
            const aiData = json.data as Record<string, unknown>;
            const formData = storeResumeData ?? ({} as Record<string, unknown>);
            const merged = {
              ...formData,
              ...aiData,
              basic: { ...(formData.basic as Record<string, unknown> ?? {}), ...(aiData.basic as Record<string, unknown> ?? {}) },
              education: (aiData.education as unknown[] ?? []).length > 0 ? aiData.education : formData.education,
              experience: (aiData.experience as unknown[] ?? []).length > 0 ? aiData.experience : formData.experience,
              projects: (aiData.projects as unknown[] ?? []).length > 0 ? aiData.projects : formData.projects,
              skills: (aiData.skills as unknown[] ?? []).length > 0 ? aiData.skills : formData.skills,
              summary: (aiData.summary as string) || formData.summary,
            };
            setResumeData(merged as Parameters<typeof setResumeData>[0]);
            setShowPreview(true);
          }
        })
        .catch(console.error)
        .finally(() => setExtracting(false));
    }
  }, [hasFormDone, conversationId, lastMsg?.id, setExtracting, setResumeData, setShowPreview, storeResumeData]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {messages.length === 0 && (
          <div className="py-12 text-center">
            <Bot className="mx-auto mb-3 size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">告诉我你的情况，我帮你做一份专业简历</p>
          </div>
        )}

        {messages.filter((m) => m.role !== "system").map((msg) => (
          <ChatBubble key={msg.id} msg={msg} formMessages={formState} />
        ))}

        {/* LangGraph: tool-push-form 触发的表单卡片 */}
        {toolForms.filter((tf) => !formState.get(tf.key)?.submitted).map((tf) => (
          <FormCard
            key={tf.key}
            type={tf.type}
            onSubmit={(_t, data) => {
              formState.set(tf.key, { type: tf.type, submitted: true });
              window.dispatchEvent(new CustomEvent("form-data", { detail: { type: tf.type, data } }));
            }}
            onCancel={() => {
              formState.set(tf.key, { type: tf.type, submitted: true });
              window.dispatchEvent(new CustomEvent("form-skip", { detail: { type: tf.type } }));
            }}
          />
        ))}

        {isStreaming && messages[messages.length - 1]?.content === "" && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
