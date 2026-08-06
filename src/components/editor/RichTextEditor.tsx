"use client";

import { useEffect, useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { FontSize } from "./extensions/FontSize";
import { TextIndent } from "./extensions/TextIndent";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Indent,
  Palette,
  Plus,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px"];

const FONT_FAMILIES = [
  { label: "默认", value: "" },
  { label: "宋体", value: '"SimSun", "宋体", serif' },
  { label: "黑体", value: '"Microsoft YaHei", "黑体", sans-serif' },
  { label: "楷体", value: '"KaiTi", "楷体", serif' },
  { label: "仿宋", value: '"FangSong", "仿宋", serif' },
  { label: "微软雅黑", value: '"Microsoft YaHei", sans-serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
];

const PRESET_COLORS = [
  "#000000", "#333333", "#666666", "#999999",
  "#cc0000", "#e74c3c", "#e67e22", "#f39c12",
  "#27ae60", "#2ecc71", "#2980b9", "#3498db",
  "#8e44ad", "#9b59b6", "#c0392b", "#1abc9c",
];

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
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      title={title}
      className={cn(
        "size-6 rounded hover:bg-muted transition-colors",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </Button>
  );
}

// ── RichTextEditor ──

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  onAiOptimize?: () => Promise<string | void>;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = "120px",
  onAiOptimize,
}: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState("#000000");
  const [aiLoading, setAiLoading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontSize,
      TextIndent,
      Color,
      FontFamily,
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none p-3",
          "text-sm leading-relaxed w-full",
        ),
        style: `min-height: ${minHeight}`,
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const handleFontSizeChange = useCallback(
    (val: string) => {
      editor
        ?.chain()
        .focus()
        .setMark("textStyle", { fontSize: val || null })
        .run();
    },
    [editor],
  );

  const handleFontFamilyChange = useCallback(
    (val: string) => {
      editor
        ?.chain()
        .focus()
        .setMark("textStyle", { fontFamily: val || null })
        .run();
    },
    [editor],
  );

  const setColor = useCallback(
    (color: string) => {
      editor?.chain().focus().setColor(color).run();
      setShowColorPicker(false);
    },
    [editor],
  );

  const currentColor =
    editor?.getAttributes("textStyle").color ?? "#000000";

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
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-muted/20 flex-wrap">
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

        {/* 文字颜色 */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="文字颜色"
            className="size-6 rounded hover:bg-muted transition-colors"
          >
            <Palette className="size-3.5" />
            <span
              className="size-2.5 rounded-full border border-border"
              style={{ backgroundColor: currentColor }}
            />
          </Button>

          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-background border rounded-lg shadow-lg p-2 w-44">
              <div className="grid grid-cols-8 gap-1 mb-2">
                {PRESET_COLORS.map((c) => (
                  <Button
                    key={c}
                    variant="ghost"
                    size="icon"
                    onClick={() => setColor(c)}
                    className="size-4 rounded-sm border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="size-5 cursor-pointer border-0 p-0"
                />
                <span className="text-[10px] text-muted-foreground">
                  {customColor}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setColor(customColor)}
                  className="ml-auto size-5 rounded hover:bg-muted"
                  title="应用自定义颜色"
                >
                  <Plus className="size-3" />
                </Button>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  editor?.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
                className="w-full mt-1.5 text-[10px] text-muted-foreground hover:text-foreground border-t pt-1 h-auto"
              >
                清除颜色
              </Button>
            </div>
          )}
        </div>

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

        <div className="w-px h-4 bg-border mx-1" />

        <Tb
          onClick={() => {
            const attrs = editor.getAttributes("paragraph");
            editor
              .chain()
              .focus()
              .updateAttributes("paragraph", {
                textIndent: attrs.textIndent === "2em" ? null : "2em",
              })
              .run();
          }}
          active={editor.getAttributes("paragraph").textIndent === "2em"}
          title="首行缩进"
        >
          <Indent className="size-3.5" />
        </Tb>

        <Select
          value={editor.getAttributes("textStyle").fontSize ?? ""}
          onValueChange={handleFontSizeChange}
        >
          <SelectTrigger className="h-6 text-[11px] bg-transparent border-border rounded px-1 w-auto gap-1" title="字号">
            <SelectValue placeholder="字号" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">默认</SelectItem>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={editor.getAttributes("textStyle").fontFamily ?? ""}
          onValueChange={handleFontFamilyChange}
        >
          <SelectTrigger className="h-6 text-[11px] bg-transparent border-border rounded px-1 w-auto max-w-[80px] gap-1" title="字体">
            <SelectValue placeholder="字体" />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {onAiOptimize && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              variant="ghost"
              size="icon"
              disabled={aiLoading}
              onClick={async () => {
                setAiLoading(true);
                try {
                  await onAiOptimize();
                } finally {
                  setAiLoading(false);
                }
              }}
              title="AI 优化"
              className="size-6 rounded hover:bg-primary/10 transition-colors text-primary"
            >
              {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            </Button>
          </>
        )}
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
