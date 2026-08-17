"use client";

/**
 * AttachmentBar — 附件栏
 *
 * 「发送时才解析」模型：chips 只展示用户附加了什么（文件名/链接），
 * 不做任何解析状态展示；点发送时附件随消息一起提交给服务端解析。
 */

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Button, Input } from "@resume/ui";
import {
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import type { AttachmentItem, AttachmentKind } from "./use-attachments";

interface AttachmentBarProps {
  attachments: AttachmentItem[];
  /** 流式回复中时隐藏选择按钮（避免打断 AI） */
  disabled: boolean;
  onPickFiles: (files: File[], kind: Extract<AttachmentKind, "image" | "file">) => void;
  onSubmitUrl: (url: string) => void;
  onRemove: (id: string) => void;
}

const KIND_ICON: Record<AttachmentKind, typeof ImageIcon> = {
  image: ImageIcon,
  file: FileText,
  link: LinkIcon,
};

export function AttachmentBar({
  attachments,
  disabled,
  onPickFiles,
  onSubmitUrl,
  onRemove,
}: AttachmentBarProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>, kind: "image" | "file") => {
    const files = Array.from(e.target.files ?? []);
    // 清空 value，保证重复选择同一文件也能触发 onChange
    e.target.value = "";
    if (files.length > 0) onPickFiles(files, kind);
  };

  const submitUrl = () => {
    const url = urlInputRef.current?.value?.trim();
    if (!url) return;
    if (urlInputRef.current) urlInputRef.current.value = "";
    setShowUrlInput(false);
    onSubmitUrl(url);
  };

  const handleUrlKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitUrl();
    }
    if (e.key === "Escape") {
      setShowUrlInput(false);
      if (urlInputRef.current) urlInputRef.current.value = "";
    }
  };

  return (
    <>
      {/* 隐藏的文件选择器（支持多选） */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e, "image")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e, "file")}
      />

      {/* 已附加 chips：只展示「附了什么」，发送时由服务端解析 */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {attachments.map((a) => {
            const KindIcon = KIND_ICON[a.kind];
            return (
              <div
                key={a.id}
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
                title={a.kind === "link" ? a.url : a.name}
              >
                <KindIcon className="size-3.5 shrink-0" />
                <span className="max-w-40 truncate">{a.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="移除"
                  className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onRemove(a.id)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* 附件按钮 + URL 输入 */}
      {!disabled && (
        <div className="mb-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            title="上传截图（可多选）"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            title="粘贴链接"
            onClick={() => {
              setShowUrlInput(!showUrlInput);
              setTimeout(() => urlInputRef.current?.focus(), 0);
            }}
          >
            <LinkIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            title="上传文件（可多选）"
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
                onKeyDown={handleUrlKeyDown}
              />
              <Button variant="ghost" size="icon" className="size-8" onClick={submitUrl}>
                <Send className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => {
                  setShowUrlInput(false);
                  if (urlInputRef.current) urlInputRef.current.value = "";
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
