/**
 * SSE 流解析工具
 *
 * 用于解析 AI 流式响应的 SSE 事件。
 */

// ── Extract ──

export interface ExtractSSEEvent {
  type: "connecting" | "chunk" | "done" | "error";
  content?: string;
  data?: Record<string, unknown>;
  message?: string;
}

/** 解析 /api/chat/extract 的 SSE 流，返回最终 data */
export async function readExtractSSE(
  response: Response,
  onChunk?: (content: string) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: Record<string, unknown> | null = null;

  const abortHandler = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6)) as ExtractSSEEvent;
          if (evt.type === "chunk" && evt.content && onChunk) {
            onChunk(evt.content);
          } else if (evt.type === "done" && evt.data) {
            result = evt.data;
          } else if (evt.type === "error") {
            throw new Error(evt.message ?? "提取失败");
          }
        } catch (err) {
          if (err instanceof Error && err.message !== "No response body") throw err;
        }
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }

  return result;
}

// ── Render Skills ──

export interface RenderSkillsSSEEvent {
  type: "chunk" | "done" | "error";
  content?: string;
  html?: string;
  message?: string;
}

/** 解析 /api/resume/render-skills 的 SSE 流，返回生成的技能 HTML */
export async function readRenderSkillsSSE(
  response: Response,
  onChunk?: (content: string) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: string | null = null;

  const abortHandler = () => reader.cancel().catch(() => {});
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6)) as RenderSkillsSSEEvent;
          if (evt.type === "chunk" && evt.content) {
            onChunk?.(evt.content);
          } else if (evt.type === "done" && evt.html) {
            result = evt.html;
          } else if (evt.type === "error") {
            throw new Error(evt.message ?? "生成失败");
          }
        } catch (err) {
          if (err instanceof Error && err.message !== "No response body") throw err;
        }
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }

  return result;
}
