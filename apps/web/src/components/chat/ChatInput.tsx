"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { useChatStore, type ResumeData } from "@/stores/chat-store";
import { Button } from "@resume/ui";
import { Textarea } from "@resume/ui";
import { Send, Square, Loader2, Quote, X } from "lucide-react";
import { toast } from "sonner";
import { randomUUID } from "@/lib/utils/uuid";
import { syncResumeToLibrary } from "./sync-resume";
import { mergeArrayItems, type AnyRecord } from "@/lib/utils/merge-data";
import { AttachmentBar } from "./AttachmentBar";
import { useAttachments, type AttachmentItem } from "./use-attachments";

const MAX_BUFFER_BYTES = 1024 * 1024; // 1MB SSE buffer limit

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 当前这条 assistant 占位消息的 id，供 pushForm 表单卡片锚定到正确位置（内联渲染）
  const assistantMsgIdRef = useRef<string | null>(null);
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
    clearLastAssistantMessage,
    setStreaming,
    setParsingAttachment,
    setError,
    setResumeData,
    setPreviewData,
    setExtracting,
    setExtractStreamText,
    appendExtractStreamText,
    setShowPreview,
    setConversations,
    setQuoteText,
    regeneratePrompt,
    clearRegenerate,
    quickSend,
    clearQuickSend,
    stop,
  } = useChatStore();

  // ── 多附件状态（本地引用，发送时由服务端解析）──
  const {
    attachments,
    hasAttachments,
    addFiles,
    addUrl,
    removeAttachment,
    clearAttachments,
  } = useAttachments();

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, []);

  // ── 核心发送逻辑 ──
  // attachments 非空时以 multipart 提交（message + files + urls），
  // 由服务端在流式开始前并行解析附件；为空时走原 JSON 链路。
  const sendRaw = useCallback(async (text: string, attachments?: AttachmentItem[]) => {
    const withAttachments = attachments && attachments.length > 0;
    if ((!text && !withAttachments) || isStreaming) return;
    setError(null);

    // 取消上一个未完成的请求
    abortRef.current?.abort();

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
    assistantMsgIdRef.current = assistantMsg.id;

    setStreaming(true);
    setParsingAttachment(!!withAttachments);

    const controller = new AbortController();
    abortRef.current = controller;

    // 用可变变量追踪当前流所属的对话 ID，避免新对话时闭包 conversationId 始终为 null
    let effectiveConvId = conversationId;

    try {
      let body: BodyInit;
      let headers: Record<string, string> | undefined;
      if (withAttachments) {
        const formData = new FormData();
        formData.append("message", text);
        for (const a of attachments) {
          if (a.kind === "link") {
            formData.append("urls", a.url ?? "");
          } else if (a.file) {
            formData.append("files", a.file, a.name);
          }
        }
        body = formData;
      } else {
        headers = { "Content-Type": "application/json" };
        // resumeData 随消息上送，供 extractResume 工具做增量提取
        body = JSON.stringify({
          conversationId: conversationId ?? undefined,
          message: text,
          resumeData: useChatStore.getState().resumeData ?? undefined,
        });
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        let errMsg = "AI 回复失败";
        try {
          const errData = await response.json() as { error?: string; message?: string };
          if (errData.error) errMsg = errData.error;
          else if (errData.message) errMsg = errData.message;
        } catch { /* use default */ }
        throw new Error(errMsg);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 防止 buffer 异常增长
        if (buffer.length > MAX_BUFFER_BYTES) {
          buffer = buffer.slice(-MAX_BUFFER_BYTES / 2);
          console.warn("[ChatInput] SSE buffer truncated to prevent overflow");
        }
        const lines = buffer.split("\n");
        // 最后一行可能是不完整的 JSON，保留到下一 chunk 再拼接，避免损坏
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              // 防止切换到其他对话后旧 SSE 流污染 store
              const sameConv = useChatStore.getState().conversationId === effectiveConvId;
              // 服务端返回了 conversationId → 更新追踪变量，后续事件才能通过 sameConv 校验
              if (parsed.conversationId) effectiveConvId = parsed.conversationId;
              if (sameConv && typeof parsed.content === "string" && useChatStore.getState().isStreaming) {
                // 附件解析占位阶段结束，首 token 到达后切回普通思考态
                setParsingAttachment(false);
                // React 18/19 会把异步 SSE 循环里的连续 store 更新批处理，导致流式内容直到结束才一次性渲染；
                // flushSync 强制每个 token 立即同步提交，实现逐字渲染。
                flushSync(() => appendToLastMessage(parsed.content));
              }
              if (sameConv) {
                if (parsed.conversationId && !conversationId) {
                  setConversationId(parsed.conversationId);
                  // 用 history.replaceState 更新 URL，避免 router.replace 触发页面重挂载导致 SSE 流中断
                  window.history.replaceState(null, "", `${location.pathname.startsWith("/m/") ? "/m" : ""}/chat/${parsed.conversationId}`);
                }
                if (parsed.title) {
                  setConversations((prev) => prev.map((c) => c.id === effectiveConvId ? { ...c, title: parsed.title as string } : c));
                }
                if (parsed.error) setError(parsed.error);
                if (parsed.tool_call?.name === "pushForm") {
                  // 带上锚点消息 id，让表单卡片内联渲染在触发它的那条 AI 消息之后（而非列表末尾）
                  window.dispatchEvent(new CustomEvent("tool-push-form", {
                    detail: { type: parsed.tool_call.args.type as string, anchorId: assistantMsgIdRef.current },
                  }));
                }
                // 收到工具调用时，清空已推送的开场白（如"让我先搜索…"），避免与最终答复重复。
                // pushForm 例外：保留开场白作为表单引导语，表单卡片内联紧随其后。
                if (parsed.tool_call && parsed.tool_call.name !== "pushForm") {
                  clearLastAssistantMessage();
                }
                if (parsed.resumeData) {
                  if (parsed.isDemo) {
                    // demo 示例简历：写入独立 previewData，不污染真实 resumeData、不同步到「我的简历」
                    setPreviewData(parsed.resumeData as ResumeData);
                  } else {
                    setResumeData(parsed.resumeData as Partial<ResumeData>);
                    // 联动：提取结果同步到「我的简历」
                    syncResumeToLibrary(parsed.conversationId ?? undefined);
                  }
                  setShowPreview(true);
                }
              }
            } catch { /* 单行 JSON 损坏则丢弃，避免污染 buffer */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
      setParsingAttachment(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isStreaming, conversationId, addMessage, appendToLastMessage, clearLastAssistantMessage, setConversationId, setConversations, setStreaming, setParsingAttachment, setError, setResumeData, setPreviewData, setShowPreview]);

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
  }, [sendRaw, setResumeData]);

  // 引用后自动 focus
  useEffect(() => {
    if (quoteText) {
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [quoteText]);

  // 组件卸载时取消未完成的请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 重新生成：watch regeneratePrompt 触发 sendRaw
  useEffect(() => {
    if (regeneratePrompt) {
      sendRaw(regeneratePrompt);
      clearRegenerate();
    }
  }, [regeneratePrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // 快捷发送：watch quickSend 触发 sendRaw（Onboarding 等场景）
  useEffect(() => {
    if (quickSend) {
      sendRaw(quickSend);
      clearQuickSend();
    }
  }, [quickSend]); // eslint-disable-line react-hooks/exhaustive-deps

  // 停止生成
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stop();
  }, [stop]);

  // ── 用户手动发消息（文字 + 多附件一起）──
  const sendMessage = useCallback(async () => {
    // 从 DOM 直接读值，避免 iOS 上 React state 闭包滞后
    const text = (textareaRef.current?.value ?? "").trim();
    if (!text && !hasAttachments) return;

    setInput("");
    // 拼装消息：引用内容 + 用户输入（附件随 multipart 单独提交，服务端解析后拼装）
    const parts: string[] = [];
    if (quoteText) parts.push(`> "${quoteText}"`);
    if (text) parts.push(text);
    const fullText = parts.join("\n\n");

    setQuoteText(null);
    const toSend = attachments;
    clearAttachments();
    await sendRaw(fullText, toSend);
  }, [sendRaw, quoteText, setQuoteText, attachments, hasAttachments, clearAttachments]);

  // 提取简历（SSE 流式）
  const handleExtract = useCallback(async () => {
    if (isExtracting) return;
    if (!conversationId) {
      toast.error("对话 ID 缺失，请刷新页面后重试");
      return;
    }

    setExtracting(true);
    setError(null);
    setExtractStreamText("");

    try {
      const { readExtractSSE } = await import("@/lib/utils/sse");
      const res = await fetch("/api/chat/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, resumeData }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const aiData = await readExtractSSE(res, (chunk) => {
        appendExtractStreamText(chunk);
      });
      if (!aiData) throw new Error("提取失败，请再聊几句");

      // 合并：已有数据优先（用户确认过的信息不覆盖），AI 补充缺失字段
      const current = useChatStore.getState().resumeData ?? ({} as Record<string, unknown>);
      const curBasic = (current.basic as Record<string, unknown> ?? {});
      const aiBasic = (aiData.basic as Record<string, unknown> ?? {});
      const merged = {
        ...current,
        ...aiData,
        // basic：用户已确认的信息不覆盖，AI 补充空缺字段
        basic: {
          ...aiBasic,
          ...curBasic,
          // 核心身份字段：已有非空值就保留，否则用 AI 的
          name: (typeof curBasic.name === "string" && curBasic.name) ? curBasic.name : aiBasic.name,
          email: (typeof curBasic.email === "string" && curBasic.email) ? curBasic.email : aiBasic.email,
          phone: (typeof curBasic.phone === "string" && curBasic.phone) ? curBasic.phone : aiBasic.phone,
        },
        education: mergeArrayItems((aiData.education as AnyRecord[] ?? []), (current.education as AnyRecord[] ?? []), "school", ["startDate", "endDate"]),
        experience: mergeArrayItems((aiData.experience as AnyRecord[] ?? []), (current.experience as AnyRecord[] ?? []), "company", ["startDate", "endDate"]),
        projects: mergeArrayItems((aiData.projects as AnyRecord[] ?? []), (current.projects as AnyRecord[] ?? []), "name", ["startDate", "endDate"]),
        skills: ((aiData.skills as unknown[] ?? []).length > 0 ? aiData.skills : current.skills),
        summary: (aiData.summary as string) || current.summary,
      };
      setResumeData(merged as Parameters<typeof setResumeData>[0]);
      setShowPreview(true);
      // 联动：提取结果同步到「我的简历」
      syncResumeToLibrary(conversationId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "提取失败，请再聊几句";
      setError(msg);
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  }, [conversationId, isExtracting, setExtracting, setResumeData, setShowPreview, setError, appendExtractStreamText, resumeData, setExtractStreamText]);

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
    <>
      <div className="print:hidden border-t border-gray-200/60 bg-white/60 backdrop-blur-xl px-4 py-4 overflow-x-hidden">
      <div className="mx-auto max-w-2xl">
        {/* 操作按钮行 */}
        {hasMessages && !isStreaming && (
          <div className="mb-3 flex justify-center">
            <Button
              size="sm"
              className="rounded-full border-0 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-sm transition-all duration-200"
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuoteText(null)}
              className="shrink-0 size-6 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        {/* 多附件栏：chips + 选择按钮 + URL 输入（发送时才解析） */}
        <AttachmentBar
          attachments={attachments}
          disabled={isStreaming}
          onPickFiles={addFiles}
          onSubmitUrl={addUrl}
          onRemove={removeAttachment}
        />

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
          {isStreaming ? (
            <Button size="icon" onMouseDown={handleStop} variant="destructive">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onMouseDown={() => sendMessage()}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>

        <p className="mt-2 text-center text-xs text-slate-400">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </div>
    </>
  );
}
