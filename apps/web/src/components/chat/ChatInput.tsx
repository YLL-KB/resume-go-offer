"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { useChatStore, type ResumeData } from "@/stores/chat-store";
import { Button } from "@resume/ui";
import { Textarea } from "@resume/ui";
import { Input } from "@resume/ui";
import { Send, Square, Loader2, X, Quote, Image as ImageIcon, Link, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { randomUUID } from "@/lib/utils/uuid";
import { mergeArrayItems, type AnyRecord } from "@/lib/utils/merge-data";

const MAX_BUFFER_BYTES = 1024 * 1024; // 1MB SSE buffer limit

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
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
    setError,
    setResumeData,
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

  // ── 附件状态 ──
  const [attachment, setAttachment] = useState<{
    status: "idle" | "uploading" | "parsing" | "done" | "error";
    type?: "image" | "file" | "link";
    name?: string;
    formatted?: string;
    error?: string;
  }>({ status: "idle" });
  const [showUrlInput, setShowUrlInput] = useState(false);

  const clearAttachment = useCallback(() => {
    setAttachment({ status: "idle" });
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, []);

  // ── 附件处理 ──

  const handleImageUpload = useCallback(async (file: File) => {
    setAttachment({ status: "uploading", type: "image", name: file.name });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/chat/parse-attachment", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "上传失败" }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { formatted: string };
      setAttachment({ status: "done", type: "image", name: file.name, formatted: data.formatted });
    } catch (err) {
      setAttachment({ status: "error", type: "image", name: file.name, error: err instanceof Error ? err.message : "解析失败" });
      toast.error(err instanceof Error ? err.message : "图片解析失败");
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setAttachment({ status: "uploading", type: "file", name: file.name });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/chat/parse-attachment", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "上传失败" }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { formatted: string };
      // 自动发送给 AI，不等到用户手动点发送
      if (data.formatted) sendRawRef.current(data.formatted);
      clearAttachment();
    } catch (err) {
      setAttachment({ status: "error", type: "file", name: file.name, error: err instanceof Error ? err.message : "解析失败" });
      toast.error(err instanceof Error ? err.message : "文件解析失败");
    }
  }, [clearAttachment]);

  const handleUrlSubmit = useCallback(async () => {
    const url = urlInputRef.current?.value?.trim();
    if (!url) return;
    setShowUrlInput(false);
    setAttachment({ status: "parsing", type: "link", name: url.slice(0, 50) });
    try {
      const res = await fetch("/api/chat/parse-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "解析失败" }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { formatted: string };
      setAttachment({ status: "done", type: "link", name: url.slice(0, 50), formatted: data.formatted });
    } catch (err) {
      setAttachment({ status: "error", type: "link", name: url.slice(0, 50), error: err instanceof Error ? err.message : "解析失败" });
      toast.error(err instanceof Error ? err.message : "链接解析失败");
    }
  }, []);

  // ── 核心发送逻辑 ──
  const sendRaw = useCallback(async (text: string) => {
    if (!text || isStreaming) return;
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

    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // 用可变变量追踪当前流所属的对话 ID，避免新对话时闭包 conversationId 始终为 null
    let effectiveConvId = conversationId;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let errMsg = "AI 回复失败";
        try {
          const errData = await response.json() as { error?: string; message?: string };
          if (errData.message) errMsg = errData.message;
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
        buffer = "";
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
              if (sameConv && typeof parsed.content === "string" && useChatStore.getState().isStreaming) appendToLastMessage(parsed.content);
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
                  window.dispatchEvent(new CustomEvent("tool-push-form", {
                    detail: { type: parsed.tool_call.args.type as string },
                  }));
                }
                // 收到工具调用时，清空已推送的开场白（如"让我先搜索…"），避免与最终答复重复
                if (parsed.tool_call) {
                  clearLastAssistantMessage();
                }
                if (parsed.resumeData) {
                  setResumeData(parsed.resumeData as Partial<ResumeData>);
                  setShowPreview(true);
                }
              }
            } catch { buffer += line + "\n"; }
          } else if (line.trim()) { buffer += line + "\n"; }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isStreaming, conversationId, addMessage, appendToLastMessage, clearLastAssistantMessage, setConversationId, setConversations, setStreaming, setError, setResumeData, setShowPreview]);

  // sendRaw 的 ref，供 handleFileUpload 等前置函数调用
  const sendRawRef = useRef(sendRaw);
  useEffect(() => {
    sendRawRef.current = sendRaw;
  }, [sendRaw]);

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

  // ── 用户手动发消息 ──
  const sendMessage = useCallback(async () => {
    // 从 DOM 直接读值，避免 iOS 上 React state 闭包滞后
    const text = (textareaRef.current?.value ?? "").trim();
    if (!text && !attachment.formatted) return;
    setInput("");
    // 拼装消息：附件内容 + 引用内容 + 用户输入
    const parts: string[] = [];
    if (attachment.status === "done" && attachment.formatted) {
      parts.push(attachment.formatted);
    }
    if (quoteText) {
      parts.push(`> "${quoteText}"`);
    }
    if (text) {
      parts.push(text);
    }
    const fullText = parts.join("\n\n");
    setQuoteText(null);
    clearAttachment();
    await sendRaw(fullText);
  }, [sendRaw, quoteText, setQuoteText, attachment, clearAttachment]);

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
      {/* 隐藏的文件选择器 */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
      />

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

        {/* 附件预览条 */}
        {attachment.status !== "idle" && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs">
            {attachment.status === "uploading" || attachment.status === "parsing" ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : attachment.status === "done" ? (
              <span className="shrink-0 text-emerald-500 font-bold">&#10003;</span>
            ) : (
              <span className="shrink-0 text-destructive font-bold">!</span>
            )}
            <span className="flex-1 truncate text-muted-foreground">
              {attachment.status === "uploading" && `上传中：${attachment.name}`}
              {attachment.status === "parsing" && `解析中：${attachment.name}`}
              {attachment.status === "done" && `${attachment.type === "image" ? "图片" : attachment.type === "link" ? "链接" : "文件"}已识别`}
              {attachment.status === "error" && `失败：${attachment.error ?? attachment.name}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearAttachment}
              className="shrink-0 size-6 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}

        {/* 附件按钮 + URL 输入 */}
        {!isStreaming && attachment.status === "idle" && (
          <div className="mb-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              title="上传截图"
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              title="粘贴链接"
              onClick={() => { setShowUrlInput(!showUrlInput); setTimeout(() => urlInputRef.current?.focus(), 0); }}
            >
              <Link className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              title="上传文件"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>

            {showUrlInput && (
              <div className="flex flex-1 items-center gap-1">
                <Input
                  ref={urlInputRef}
                  type="url"
                  placeholder="粘贴招聘链接..."
                  className="flex-1 h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUrlSubmit();
                    if (e.key === "Escape") { setShowUrlInput(false); if (urlInputRef.current) urlInputRef.current.value = ""; }
                  }}
                />
                <Button variant="ghost" size="icon" className="size-8" onClick={handleUrlSubmit}>
                  <Send className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => { setShowUrlInput(false); if (urlInputRef.current) urlInputRef.current.value = ""; }}>
                  <X className="size-3.5" />
                </Button>
              </div>
            )}
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
