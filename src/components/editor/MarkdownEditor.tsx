"use client";

import { Textarea } from "@/components/ui/textarea";

interface Props {
  value: string;
  onChange: (markdown: string) => void;
}

export function MarkdownEditor({ value, onChange }: Props) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-full min-h-[300px] p-3 text-sm font-mono leading-relaxed resize-none rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
      placeholder="编辑 Markdown..."
    />
  );
}
