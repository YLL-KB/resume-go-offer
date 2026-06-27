"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "./RichTextEditor";
import type { ResumeData } from "@/lib/validators/resume.schema";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

// ───────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────

interface SectionEditorProps {
  sectionType: string;
  data: ResumeData;
  onChange: (data: ResumeData) => void;
}

// ───────────────────────────────────────────────
// 1) 基本信息
// ───────────────────────────────────────────────

function BasicInfoEditor({ data, onChange }: SectionEditorProps) {
  const b = data.basic;

  const set = (key: keyof typeof b, val: string) =>
    onChange({ ...data, basic: { ...data.basic, [key]: val } });

  return (
    <div className="space-y-3">
      {(
        [
          ["name", "姓名"],
          ["title", "职位"],
          ["email", "邮箱"],
          ["phone", "电话"],
          ["location", "所在地"],
          ["website", "个人网站"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <Label className="text-xs text-muted-foreground mb-1 block">
            {label}
          </Label>
          <Input
            value={b[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
            className="h-8 text-sm"
            placeholder={label}
          />
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────
// 2) 个人总结
// ───────────────────────────────────────────────

function SummaryEditor({ data, onChange }: SectionEditorProps) {
  return (
    <RichTextEditor
      value={data.summary ?? ""}
      onChange={(html) => onChange({ ...data, summary: html })}
      placeholder="写一段个人总结..."
      minHeight="200px"
    />
  );
}

// ───────────────────────────────────────────────
// 3) 工作经历 (可增删列表 + 富文本描述)
// ───────────────────────────────────────────────

function ExperienceEditor({ data, onChange }: SectionEditorProps) {
  const items = data.experience ?? [];

  const update = (i: number, patch: Partial<(typeof items)[0]>) => {
    const next = items.map((item, idx) =>
      idx === i ? { ...item, ...patch } : item,
    );
    onChange({ ...data, experience: next });
  };

  const add = () => {
    onChange({
      ...data,
      experience: [
        ...items,
        {
          company: "",
          title: "",
          startDate: "",
          endDate: "",
          description: "",
          highlights: [],
        },
      ],
    });
  };

  const remove = (i: number) => {
    onChange({ ...data, experience: items.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      {items.map((exp, i) => (
        <ExpandableItem
          key={i}
          title={exp.company || `工作经历 ${i + 1}`}
          subtitle={exp.title}
          onRemove={() => remove(i)}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">公司</Label>
                <Input
                  value={exp.company}
                  onChange={(e) => update(i, { company: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">职位</Label>
                <Input
                  value={exp.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">开始</Label>
                <Input
                  value={exp.startDate}
                  onChange={(e) => update(i, { startDate: e.target.value })}
                  className="h-8 text-sm"
                  placeholder="2021.03"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">结束</Label>
                <Input
                  value={exp.endDate}
                  onChange={(e) => update(i, { endDate: e.target.value })}
                  className="h-8 text-sm"
                  placeholder="至今"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                描述
              </Label>
              <RichTextEditor
                value={exp.description ?? ""}
                onChange={(html) => update(i, { description: html })}
                placeholder="描述工作内容与成果..."
                minHeight="100px"
              />
            </div>
          </div>
        </ExpandableItem>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="mr-1 size-3.5" />添加工作经历
      </Button>
    </div>
  );
}

// ───────────────────────────────────────────────
// 4) 教育经历
// ───────────────────────────────────────────────

function EducationEditor({ data, onChange }: SectionEditorProps) {
  const items = data.education ?? [];

  const update = (i: number, patch: Partial<(typeof items)[0]>) => {
    const next = items.map((item, idx) =>
      idx === i ? { ...item, ...patch } : item,
    );
    onChange({ ...data, education: next });
  };

  const add = () => {
    onChange({
      ...data,
      education: [
        ...items,
        {
          school: "",
          degree: "",
          major: "",
          startDate: "",
          endDate: "",
          gpa: "",
        },
      ],
    });
  };

  const remove = (i: number) => {
    onChange({ ...data, education: items.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      {items.map((edu, i) => (
        <ExpandableItem
          key={i}
          title={edu.school || `教育经历 ${i + 1}`}
          subtitle={edu.degree ? `${edu.degree} · ${edu.major}` : undefined}
          onRemove={() => remove(i)}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["school", "学校"],
                  ["degree", "学位"],
                  ["major", "专业"],
                  ["startDate", "开始"],
                  ["endDate", "结束"],
                  ["gpa", "GPA"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <Input
                    value={edu[key] ?? ""}
                    onChange={(e) => update(i, { [key]: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </ExpandableItem>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="mr-1 size-3.5" />添加教育经历
      </Button>
    </div>
  );
}

// ───────────────────────────────────────────────
// 5) 项目经验
// ───────────────────────────────────────────────

function ProjectsEditor({ data, onChange }: SectionEditorProps) {
  const items = data.projects ?? [];

  const update = (i: number, patch: Partial<(typeof items)[0]>) => {
    const next = items.map((item, idx) =>
      idx === i ? { ...item, ...patch } : item,
    );
    onChange({ ...data, projects: next });
  };

  const add = () => {
    onChange({
      ...data,
      projects: [
        ...items,
        {
          name: "",
          description: "",
          url: "",
          techStack: "",
          highlights: [],
        },
      ],
    });
  };

  const remove = (i: number) => {
    onChange({ ...data, projects: items.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      {items.map((proj, i) => (
        <ExpandableItem
          key={i}
          title={proj.name || `项目 ${i + 1}`}
          subtitle={proj.techStack}
          onRemove={() => remove(i)}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">项目名</Label>
                <Input
                  value={proj.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">链接</Label>
                <Input
                  value={proj.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">技术栈</Label>
              <Input
                value={proj.techStack}
                onChange={(e) => update(i, { techStack: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                描述
              </Label>
              <RichTextEditor
                value={proj.description ?? ""}
                onChange={(html) => update(i, { description: html })}
                placeholder="描述项目内容与成果..."
                minHeight="100px"
              />
            </div>
          </div>
        </ExpandableItem>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="mr-1 size-3.5" />添加项目
      </Button>
    </div>
  );
}

// ───────────────────────────────────────────────
// 6) 技能标签
// ───────────────────────────────────────────────

function SkillsEditor({ data, onChange }: SectionEditorProps) {
  const skills = data.skills ?? [];
  const [input, setInput] = useState("");

  const add = () => {
    const s = input.trim();
    if (!s || skills.includes(s)) return;
    onChange({ ...data, skills: [...skills, s] });
    setInput("");
  };

  const remove = (idx: number) => {
    onChange({ ...data, skills: skills.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s, i) => (
          <Badge
            key={i}
            variant="secondary"
            className="gap-1 pr-1 cursor-default"
          >
            {s}
            <button
              onClick={() => remove(i)}
              className="ml-0.5 hover:text-destructive transition-colors"
            >
              <Trash2 className="size-3" />
            </button>
          </Badge>
        ))}
        {skills.length === 0 && (
          <p className="text-xs text-muted-foreground">暂未添加技能</p>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          className="h-8 text-sm"
          placeholder="输入技能名称，回车添加"
        />
        <Button size="sm" variant="outline" onClick={add}>
          添加
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
// 可展开的列表项
// ───────────────────────────────────────────────

function ExpandableItem({
  title,
  subtitle,
  children,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen(!open)}
          className="hover:bg-muted rounded p-0.5 transition-colors"
        >
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">
            {title || "未命名"}
          </span>
          {subtitle && (
            <span className="text-xs text-muted-foreground truncate block">
              {subtitle}
            </span>
          )}
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3 border-t pt-3 bg-muted/10">{children}</div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────
// Section Editor — dispatcher
// ───────────────────────────────────────────────

export function SectionEditor(props: SectionEditorProps) {
  switch (props.sectionType) {
    case "header":
      return <BasicInfoEditor {...props} />;
    case "summary":
      return <SummaryEditor {...props} />;
    case "experience":
      return <ExperienceEditor {...props} />;
    case "education":
      return <EducationEditor {...props} />;
    case "projects":
      return <ProjectsEditor {...props} />;
    case "skills":
      return <SkillsEditor {...props} />;
    default:
      return (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          暂不支持此模块类型
        </div>
      );
  }
}
