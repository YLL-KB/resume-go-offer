"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore, type ChatMessage as ChatMessageType } from "@/stores/chat-store";
import { FormCard, type FormType } from "./FormCard";
import { marked } from "marked";
import { User, Bot } from "lucide-react";

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

  const hasContent = text.length > 0 || forms.length > 0;
  if (!hasContent) return null;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div className={`max-w-[80%] space-y-3 ${isUser ? "items-end" : ""}`}>
        {text && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{text}</p>
            ) : (
              <div
                className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                dangerouslySetInnerHTML={{ __html: marked.parse(text, { async: false }) as string }}
              />
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
