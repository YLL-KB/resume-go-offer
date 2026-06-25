"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

// ============================================================
// 类型定义
// ============================================================
export interface ResumeField {
  key: string;
  label: string;
  value: string;
}

export interface ResumeListItem {
  fields: ResumeField[];
}

export interface ResumeSection {
  title: string;
  type: "fields" | "textarea" | "list";
  fields?: ResumeField[];
  content?: string;
  items?: ResumeListItem[];
}

export interface ResumeData {
  sections: ResumeSection[];
}

// ============================================================
// 组件
// ============================================================
interface Props {
  filename?: string;
  data: ResumeData;
  loading: boolean;
  onChange: (data: ResumeData) => void;
  onReAnalyze: (text: string) => void;
  onCancel: () => void;
}

export default function ResumeEditor({
  data,
  loading,
  filename,
  onChange,
  onReAnalyze,
  onCancel,
}: Props) {
  const rebuildText = () => {
    return data.sections
      .map((section) => {
        if (section.type === "fields") {
          return section.fields
            ?.map((f) => `${f.label}：${f.value}`)
            .join("\n");
        }
        if (section.type === "textarea") {
          return section.content;
        }
        if (section.type === "list") {
          const header = section.title;
          const items =
            section.items
              ?.map((item) =>
                item.fields.map((f) => `${f.value}`).join(" "),
              )
              .join("\n\n") ?? "";
          return `${header}\n\n${items}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  };

  const updateField = (
    sectionIdx: number,
    fieldIdx: number,
    value: string,
  ) => {
    const next = structuredClone(data);
    const section = next.sections[sectionIdx];
    if (section.type === "fields" && section.fields) {
      section.fields[fieldIdx].value = value;
    }
    onChange(next);
  };

  const updateTextarea = (sectionIdx: number, value: string) => {
    const next = structuredClone(data);
    const section = next.sections[sectionIdx];
    if (section.type === "textarea") {
      section.content = value;
    }
    onChange(next);
  };

  const updateListItemField = (
    sectionIdx: number,
    itemIdx: number,
    fieldIdx: number,
    value: string,
  ) => {
    const next = structuredClone(data);
    const section = next.sections[sectionIdx];
    if (section.type === "list" && section.items) {
      section.items[itemIdx].fields[fieldIdx].value = value;
    }
    onChange(next);
  };

  const addListItem = (sectionIdx: number) => {
    const next = structuredClone(data);
    const section = next.sections[sectionIdx];
    if (section.type === "list") {
      const template =
        section.items?.[0]?.fields.map((f) => ({
          ...f,
          value: "",
        })) ?? [];
      section.items = [...(section.items ?? []), { fields: template }];
    }
    onChange(next);
  };

  const removeListItem = (sectionIdx: number, itemIdx: number) => {
    const next = structuredClone(data);
    const section = next.sections[sectionIdx];
    if (section.type === "list" && section.items) {
      section.items = section.items.filter((_, i) => i !== itemIdx);
    }
    onChange(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {data.sections.map((section, si) => (
        <Card key={si}>
          <CardContent className="p-5">
            <h4 className="mb-4 flex items-center gap-2 font-semibold text-lg">
              <FileText className="size-4 text-primary" />
              {section.title}
            </h4>

            {/* 键值对字段 */}
            {section.type === "fields" && section.fields && (
              <div className="grid gap-3 sm:grid-cols-2">
                {section.fields.map((field, fi) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      {field.label}
                    </label>
                    <input
                      value={field.value}
                      onChange={(e) =>
                        updateField(si, fi, e.target.value)
                      }
                      className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50 focus:bg-background"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 大段文本 */}
            {section.type === "textarea" && (
              <textarea
                value={section.content ?? ""}
                onChange={(e) => updateTextarea(si, e.target.value)}
                className="w-full rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed outline-none transition-colors focus:border-primary/50 focus:bg-background"
                rows={Math.max(4, (section.content ?? "").split("\n").length)}
              />
            )}

            {/* 列表（工作经历/项目经历） */}
            {section.type === "list" && (
              <div className="space-y-4">
                {section.items?.map((item, ii) => (
                  <div
                    key={ii}
                    className="relative rounded-lg border bg-muted/20 p-4"
                  >
                    <button
                      onClick={() => removeListItem(si, ii)}
                      className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="删除此项"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {item.fields.map((field, fi) => {
                        const isLong =
                          field.key === "description" ||
                          field.key === "techStack" ||
                          field.key === "introduction" ||
                          field.key === "tech" ||
                          field.key === "techs" ||
                          field.label.includes("描述") ||
                          field.label.includes("技术") ||
                          field.label.includes("介绍");
                        return (
                          <div
                            key={field.key}
                            className={isLong ? "sm:col-span-2" : ""}
                          >
                            <label className="mb-1 block text-xs text-muted-foreground">
                              {field.label}
                            </label>
                            {isLong ? (
                              <textarea
                                value={field.value}
                                onChange={(e) =>
                                  updateListItemField(
                                    si,
                                    ii,
                                    fi,
                                    e.target.value,
                                  )
                                }
                                className="w-full rounded-lg border bg-muted/30 p-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary/50 focus:bg-background"
                                rows={3}
                              />
                            ) : (
                              <input
                                value={field.value}
                                onChange={(e) =>
                                  updateListItemField(
                                    si,
                                    ii,
                                    fi,
                                    e.target.value,
                                  )
                                }
                                className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50 focus:bg-background"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addListItem(si)}
                >
                  <Plus className="mr-1 size-3.5" />
                  添加{section.title.includes("工作") || section.title.includes("项目") ? "一项" : "一行"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          撤销修改
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => {
            const text = rebuildText();
            const blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename?.replace(/\.(pdf|docx?|txt)$/i, "-已编辑.txt") ?? "简历-已编辑.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          💾 另存为
        </Button>
        <Button
          size="sm"
          disabled={loading}
          onClick={() => onReAnalyze(rebuildText())}
        >
          {loading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          {loading ? "分析中..." : "重新分析"}
        </Button>
      </div>
    </motion.div>
  );
}
