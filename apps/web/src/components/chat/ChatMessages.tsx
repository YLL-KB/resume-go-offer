"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useChatStore, type ChatMessage as ChatMessageType } from "@/stores/chat-store";
import { FormCard, type FormType } from "./FormCard";
import { mergeArrayItems, type AnyRecord } from "@/lib/utils/merge-data";
import { marked } from "marked";
import { User, Bot, Copy, Check, Quote, TextSelect, Trash2, RefreshCw, MoreHorizontal } from "lucide-react";
import { Button } from "@resume/ui";
import { Avatar, AvatarImage, AvatarFallback } from "@resume/ui";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@resume/ui";
import { useAuth } from "@resume/ui";

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

function ChatBubble({ msg, formMessages, firstFormMsgIds, userAvatarUrl }: { msg: ChatMessageType; formMessages: Map<string, { type: FormType; submitted?: boolean }>; firstFormMsgIds: Map<string, string>; userAvatarUrl?: string | null }) {
  const isUser = msg.role === "user";
  const { text, forms } = parseForms(msg.content);
  const [copied, setCopied] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const setQuoteText = useChatStore((s) => s.setQuoteText);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const triggerRegenerate = useChatStore((s) => s.triggerRegenerate);
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRegenerate = () => {
    // 找到前一条 user 消息
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prevUser = messages.slice(0, idx).findLast((m) => m.role === "user");
    if (!prevUser) return;
    // 先删当前 assistant 消息，再触发重新生成
    deleteMessage(msg.id);
    // 等 delete 完成后触发
    setTimeout(() => triggerRegenerate(prevUser.content), 50);
  };

  const handleDelete = () => {
    if (confirmDelete) {
      deleteMessage(msg.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

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

  const handleCopy = async () => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = marked.parse(text, { async: false }) as string;
    const plainText = tempDiv.textContent ?? tempDiv.innerText ?? text;
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuoteFull = () => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = marked.parse(text, { async: false }) as string;
    const plainText = (tempDiv.textContent ?? tempDiv.innerText ?? text).trim();
    setQuoteText(plainText);
  };

  const hasContent = text.length > 0 || forms.length > 0;
  if (!hasContent) return null;

  // 最后一条 AI 消息正在流式输出时，末尾追加闪烁光标，提示仍在生成
  const isLastStreaming = isStreaming && !isUser && messages[messages.length - 1]?.id === msg.id;
  const renderHtml = isLastStreaming
    ? marked.parse(`${text}<span class="streaming-cursor"></span>`, { async: false }) as string
    : marked.parse(text, { async: false }) as string;

  return (
    <div className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm ${
          isUser ? "bg-primary text-primary-foreground overflow-hidden" : "bg-emerald-100 text-emerald-700"
        }`}
      >
        {isUser ? (
          userAvatarUrl ? (
            <Avatar className="size-8">
              <AvatarImage src={userAvatarUrl} alt="avatar" />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                <User className="size-4" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <User className="size-4" />
          )
        ) : (
          <Bot className="size-4" />
        )}
      </div>

      <div ref={bubbleRef} className={`max-w-[85%] md:max-w-[80%] space-y-3 ${isUser ? "items-end" : "min-w-0"}`}>
        {text ? (
          <div>
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                isUser ? "bg-primary text-primary-foreground" : "bg-white/70 border border-gray-200/60 text-slate-800"
              }`}
              onMouseUp={!isUser ? handleMouseUp : undefined}
              onTouchEnd={!isUser ? handleTouchEnd : undefined}
            >
              <div
                ref={contentRef}
                className={`md-content select-text ${isUser ? "[&_strong]:text-primary-foreground [&_code]:bg-white/20" : "[&_a]:text-emerald-400"}`}
                dangerouslySetInnerHTML={{ __html: renderHtml }}
              />
            </div>

            {/* 底部操作栏 */}
            {!isUser && (
              <div className="flex items-center gap-1 mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity relative">
                {/* Desktop: 全部展开 */}
                <div className="hidden md:flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="h-auto py-0.5 text-xs text-muted-foreground hover:text-foreground" title="复制">
                    {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                    {copied ? "已复制" : "复制"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleQuoteFull} className="h-auto py-0.5 text-xs text-muted-foreground hover:text-foreground" title="引用追问">
                    <Quote className="size-3" />引用
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={handleDelete}
                    className={`h-auto py-0.5 text-xs ${confirmDelete ? "text-red-500 bg-red-50 hover:bg-red-100" : "text-muted-foreground hover:text-foreground"}`}
                    title={confirmDelete ? "确认删除这组对话" : "删除这组对话"}
                  >
                    <Trash2 className="size-3" />{confirmDelete ? "确认" : "删除"}
                  </Button>
                  {!isStreaming && (
                    <Button variant="ghost" size="sm" onClick={handleRegenerate} className="h-auto py-0.5 text-xs text-muted-foreground hover:text-foreground" title="重新生成">
                      <RefreshCw className="size-3" />重新生成
                    </Button>
                  )}
                </div>

                {/* Mobile: DropdownMenu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild className="md:hidden">
                    <Button variant="ghost" size="sm" className="h-auto py-0.5 text-xs text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-32">
                    <DropdownMenuItem onClick={handleCopy} className="text-xs">
                      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                      {copied ? "已复制" : "复制"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleQuoteFull} className="text-xs">
                      <Quote className="size-3" />引用追问
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSelectText} className="text-xs">
                      <TextSelect className="size-3" />选择文本
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => deleteMessage(msg.id)} className="text-xs text-red-500">
                      <Trash2 className="size-3" />删除
                    </DropdownMenuItem>
                    {!isStreaming && (
                      <DropdownMenuItem onClick={handleRegenerate} className="text-xs">
                        <RefreshCw className="size-3" />重新生成
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {/* 用户消息操作栏 */}
            {isUser && (
              <div className="flex items-center gap-1 mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity justify-end">
                <Button
                  variant="ghost" size="sm"
                  onClick={handleDelete}
                  className={`h-auto py-0.5 text-xs ${confirmDelete ? "text-red-500 bg-red-50 hover:bg-red-100" : "text-muted-foreground hover:text-foreground"}`}
                  title={confirmDelete ? "确认删除这组对话" : "删除这组对话"}
                >
                  <Trash2 className="size-3" />{confirmDelete ? "确认" : "删除"}
                </Button>
              </div>
            )}
          </div>
        ) : !isUser ? (
          /* 流式加载中：AI 思考动画 */
          <div className="rounded-2xl bg-white/70 border border-gray-200/60 px-4 py-3 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="size-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: "0ms" }} />
              <span className="size-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: "150ms" }} />
              <span className="size-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: "300ms" }} />
              <span className="ml-1 text-xs text-slate-400">AI 思考中...</span>
            </div>
          </div>
        ) : null}

        {forms.map((type, i) => {
          if (firstFormMsgIds.get(type) !== msg.id) return null;
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleQuote}
            onMouseDown={(e) => e.preventDefault()}
            className="h-auto py-1.5 text-xs font-medium shadow-md"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
            引用追问
          </Button>
        </div>
      )}
    </div>
  );
}

// ── 打字指示器 ──

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Bot className="size-4" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-white/70 border border-gray-200/60 px-4 py-3">
        <span className="size-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: "0ms" }} />
        <span className="size-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: "150ms" }} />
        <span className="size-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: "300ms" }} />
        <span className="ml-1 text-xs text-slate-400">AI 正在思考...</span>
      </div>
    </div>
  );
}

// ── 消息列表 ──

export function ChatMessages() {
  const { user } = useAuth();
  const userAvatarUrl = user?.avatarUrl;
  const { messages, isStreaming, isExtracting, setShowPreview, setResumeData, setExtracting, conversationId, extractStreamText, setExtractStreamText, appendExtractStreamText } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [formState] = useState<Map<string, { type: FormType; submitted?: boolean }>>(new Map());
  // LangGraph: tool-push-form 事件触发的表单
  const [toolForms, setToolForms] = useState<Array<{ key: string; type: FormType }>>([]);
  // 全局去重：每个表单类型只在第一条包含它的消息中渲染
  const { firstFormMsgIds, shownFormTypes } = useMemo(() => {
    const first = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === "system") continue;
      const { forms } = parseForms(msg.content);
      for (const type of forms) {
        if (!first.has(type)) first.set(type, msg.id);
      }
    }
    return { firstFormMsgIds: first, shownFormTypes: new Set(first.keys()) };
  }, [messages]);

  // 工具表单去重：跳过已提交或已在消息中出现的类型
  const visibleToolForms = useMemo(() => {
    const seen = new Set(shownFormTypes);
    return toolForms.filter((tf) => {
      if (formState.get(tf.key)?.submitted) return false;
      if (seen.has(tf.type)) return false;
      seen.add(tf.type);
      return true;
    });
  }, [toolForms, shownFormTypes, formState]);

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
        setExtractStreamText("");
        import("@/lib/utils/sse").then(({ readExtractSSE }) =>
          fetch("/api/chat/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, resumeData: useChatStore.getState().resumeData }),
          })
            .then((res) => readExtractSSE(res, (chunk) => { appendExtractStreamText(chunk); }))
            .then((data) => { if (data) { setResumeData(data); setShowPreview(true); } })
            .catch(console.error)
            .finally(() => setExtracting(false)),
        );
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
  }, [conversationId, setExtracting, setResumeData, setShowPreview, formState, appendExtractStreamText, setExtractStreamText]);

  const lastMsg = messages[messages.length - 1];
  const hasFormDone = lastMsg?.role === "assistant" && /\[FORM:done\]/.test(lastMsg.content);

  // 检测到 [FORM:done] 自动提取简历并展示预览
  const lastDoneRef = useRef<string | null>(null);
  const storeResumeData = useChatStore((s) => s.resumeData);
  useEffect(() => {
    if (hasFormDone && conversationId && lastDoneRef.current !== lastMsg.id) {
      lastDoneRef.current = lastMsg.id;
      setExtracting(true);
      setExtractStreamText("");
      import("@/lib/utils/sse").then(({ readExtractSSE }) =>
        fetch("/api/chat/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, resumeData: storeResumeData }),
        })
          .then((res) => readExtractSSE(res, (chunk) => { appendExtractStreamText(chunk); }))
          .then((aiData) => {
            if (aiData) {
              // 合并：已有数据优先（用户确认过的信息不覆盖），AI 补充缺失字段
              const formData = storeResumeData ?? ({} as Record<string, unknown>);
              const fBasic = (formData.basic as Record<string, unknown> ?? {});
              const aBasic = (aiData.basic as Record<string, unknown> ?? {});
              const merged = {
                ...formData,
                ...aiData,
                // basic：用户已确认的信息不覆盖，AI 补充空缺字段
                basic: {
                  ...aBasic,
                  ...fBasic,
                  // 核心身份字段：已有非空值就保留，否则用 AI 的
                  name: (typeof fBasic.name === "string" && fBasic.name) ? fBasic.name : aBasic.name,
                  email: (typeof fBasic.email === "string" && fBasic.email) ? fBasic.email : aBasic.email,
                  phone: (typeof fBasic.phone === "string" && fBasic.phone) ? fBasic.phone : aBasic.phone,
                },
                education: mergeArrayItems((aiData.education as AnyRecord[] ?? []), (formData.education as AnyRecord[] ?? []), "school", ["startDate", "endDate"]),
                experience: mergeArrayItems((aiData.experience as AnyRecord[] ?? []), (formData.experience as AnyRecord[] ?? []), "company", ["startDate", "endDate"]),
                projects: mergeArrayItems((aiData.projects as AnyRecord[] ?? []), (formData.projects as AnyRecord[] ?? []), "name", ["startDate", "endDate"]),
                skills: ((aiData.skills as unknown[] ?? []).length > 0 ? aiData.skills : formData.skills),
                summary: (aiData.summary as string) || formData.summary,
              };
              setResumeData(merged as Parameters<typeof setResumeData>[0]);
              setShowPreview(true);
            }
          })
          .catch(console.error)
          .finally(() => setExtracting(false)),
      );
    }
  }, [hasFormDone, conversationId, lastMsg?.id, setExtracting, setResumeData, setShowPreview, storeResumeData, appendExtractStreamText, setExtractStreamText]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {messages.length === 0 && (
          <div className="py-12 text-center">
            <Bot className="mx-auto mb-3 size-10 text-slate-200" />
            <p className="text-sm text-slate-500">告诉我你的情况，我帮你做一份专业简历</p>
          </div>
        )}

        {messages.filter((m) => m.role !== "system").map((msg) => (
          <ChatBubble key={msg.id} msg={msg} formMessages={formState} firstFormMsgIds={firstFormMsgIds} userAvatarUrl={userAvatarUrl} />
        ))}

        {/* 简历提取中 */}
        {isExtracting && (
          <div className="flex gap-3">
            <span className="mt-1 shrink-0 text-sm font-bold text-emerald-600">🤖</span>
            <div className="rounded-lg bg-white/70 border border-gray-200/60 px-4 py-3 text-sm leading-relaxed">
              <p className="mb-1 font-semibold text-xs text-slate-500">AI 正在提取简历...</p>
              {extractStreamText && (
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-500 max-h-60 overflow-y-auto">{extractStreamText}</pre>
              )}
            </div>
          </div>
        )}

        {/* LangGraph: tool-push-form 触发的表单卡片 */}
        {visibleToolForms.map((tf) => (
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
