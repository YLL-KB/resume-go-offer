"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onUpload: (files: File[]) => Promise<void>;
  uploading?: boolean;
  accept?: string;
  multiple?: boolean;
  className?: string;
}

export function UploadZone({
  onUpload,
  uploading,
  accept = ".pdf",
  multiple = true,
  className,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      const valid = files.filter((f) => {
        const ext = "." + f.name.split(".").pop()?.toLowerCase();
        const allowed = accept.split(",").map((s) => s.trim().toLowerCase());
        return allowed.some(
          (a) =>
            a === ext ||
            (f.type === "application/pdf" && a === ".pdf") ||
            (f.type.includes("wordprocessingml") && a === ".docx") ||
            (f.type === "application/msword" && a === ".doc"),
        );
      });
      if (valid.length) onUpload(valid);
    },
    [accept, onUpload],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onUpload(files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onUpload],
  );

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-xl aspect-[3/4] flex flex-col items-center justify-center p-4 text-center transition-colors cursor-pointer",
        dragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        uploading && "pointer-events-none opacity-60",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-10 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">上传中...</span>
        </div>
      ) : dragging ? (
        <div className="flex flex-col items-center gap-2">
          <Upload className="size-10 text-primary" />
          <span className="text-sm font-medium text-primary">松开以上传</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <FileText className="size-10 text-muted-foreground/40" />
          <span className="text-sm font-medium">
            拖拽 PDF 文件到此处
          </span>
          <span className="text-xs text-muted-foreground">
            或点击选择文件，支持 .pdf
          </span>
        </div>
      )}
    </div>
  );
}
