/**
 * 聊天简历 → 「我的简历」联动同步（静默）。
 *
 * 每次提取合并完成后调用：读取 store 中的合并结果，
 * POST /api/chat/resume（对话已关联简历则更新版本，否则新建并回填关联）。
 * 失败只打日志，不打断对话流程。
 */

import { useChatStore } from "@/stores/chat-store";
import { syncChatResume } from "@/lib/api/resume";

export function syncResumeToLibrary(conversationId?: string | null): void {
  const cid = conversationId ?? useChatStore.getState().conversationId;
  const data = useChatStore.getState().resumeData;
  if (!cid || !data) return;

  // 无实质内容的空数据不同步，避免在「我的简历」里产生垃圾条目
  const name = typeof data.basic?.name === "string" ? data.basic.name.trim() : "";
  const hasContent =
    !!name ||
    (data.experience?.length ?? 0) > 0 ||
    (data.education?.length ?? 0) > 0 ||
    !!data.summary?.trim();
  if (!hasContent) return;

  syncChatResume(cid, data).catch((err) => {
    console.warn("[resume-sync] 同步到我的简历失败:", err instanceof Error ? err.message : err);
  });
}
