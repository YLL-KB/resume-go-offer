"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Toolbar button ──

function Tb({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded hover:bg-muted transition-colors",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── RichTextEditor ──

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = "120px",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none p-3",
          "text-sm leading-relaxed",
        ),
        style: `min-height: ${minHeight}`,
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  // Sync external value changes (e.g. section switch)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className="bg-muted/30 animate-pulse rounded-lg"
        style={{ minHeight }}
      />
    );
  }

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden bg-background",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-muted/20">
        <Tb
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="加粗"
        >
          <Bold className="size-3.5" />
        </Tb>
        <Tb
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="斜体"
        >
          <Italic className="size-3.5" />
        </Tb>
        <Tb
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="下划线"
        >
          <UnderlineIcon className="size-3.5" />
        </Tb>

        <div className="w-px h-4 bg-border mx-1" />

        <Tb
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="无序列表"
        >
          <List className="size-3.5" />
        </Tb>
        <Tb
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="有序列表"
        >
          <ListOrdered className="size-3.5" />
        </Tb>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
