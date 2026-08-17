"use client";

/**
 * use-attachments — 聊天附件状态管理
 *
 * 「发送时才解析」模型：附件在用户侧只保留本地引用（File / URL），
 * 不产生任何上传或解析请求；点发送时随消息一起以 multipart 提交给
 * /api/chat，由服务端在流式开始前并行解析。
 */

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { randomUUID } from "@/lib/utils/uuid";

export type AttachmentKind = "image" | "file" | "link";

export interface AttachmentItem {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** 原始文件（发送时随 multipart 提交） */
  file?: File;
  /** 原始链接（发送时随 multipart 提交） */
  url?: string;
}

export const MAX_ATTACHMENTS = 5;

export function useAttachments() {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  /** 批量添加文件 / 图片（仅本地引用，不发起任何请求） */
  const addFiles = useCallback(
    (files: File[], kind: "image" | "file") => {
      const valid = files.filter((f) => f && f.size > 0);
      if (valid.length === 0) return;
      if (attachments.length >= MAX_ATTACHMENTS) {
        toast.error(`最多同时附加 ${MAX_ATTACHMENTS} 个附件`);
        return;
      }

      const room = MAX_ATTACHMENTS - attachments.length;
      const toAdd: AttachmentItem[] = valid.slice(0, room).map((file) => ({
        id: randomUUID(),
        kind,
        name: file.name,
        file,
      }));
      if (valid.length > room) {
        toast.error(`最多同时附加 ${MAX_ATTACHMENTS} 个附件，已忽略多余文件`);
      }
      setAttachments((prev) => [...prev, ...toAdd]);
    },
    [attachments.length],
  );

  /** 添加链接附件（仅本地引用） */
  const addUrl = useCallback(
    (url: string) => {
      if (attachments.length >= MAX_ATTACHMENTS) {
        toast.error(`最多同时附加 ${MAX_ATTACHMENTS} 个附件`);
        return;
      }
      const item: AttachmentItem = {
        id: randomUUID(),
        kind: "link",
        name: url.slice(0, 60),
        url,
      };
      setAttachments((prev) => [...prev, item]);
    },
    [attachments.length],
  );

  /** 移除单个附件 */
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /** 清空全部附件（发送后） */
  const clearAttachments = useCallback(() => setAttachments([]), []);

  const hasAttachments = useMemo(() => attachments.length > 0, [attachments]);

  return {
    attachments,
    hasAttachments,
    addFiles,
    addUrl,
    removeAttachment,
    clearAttachments,
  };
}
