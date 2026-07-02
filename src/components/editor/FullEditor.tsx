"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "./RichTextEditor";
import type { ResumeData } from "@/lib/validators/resume.schema";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { data: ResumeData; onChange: (data: ResumeData) => void; }

export function FullEditor({ data, onChange }: Props) {
  return (
    <div className="space-y-2 p-4">
      <Section title="基本信息" defaultOpen>
        <BasicFields data={data} onChange={onChange} />
      </Section>
      <Section title="个人总结">
        <div className="space-y-1">
          <Label className="text-xs">个人总结</Label>
          <RichTextEditor value={data.summary||""} onChange={v => onChange({...data, summary:v})} minHeight="120px" placeholder="AI 已自动提取，可修改..." />
        </div>
      </Section>
      <Section title={`工作经历 (${data.experience.length})`}>
        <ListEditor items={data.experience as unknown as Record<string,string>[]} onChange={items => onChange({...data, experience:items as unknown as ResumeData["experience"]})}
          fields={[
            { key:"company", label:"公司", placeholder:"公司名称" },
            { key:"title", label:"职位", placeholder:"职位" },
            { key:"startDate", label:"开始", placeholder:"2020.01" },
            { key:"endDate", label:"结束", placeholder:"至今" },
          ]}
          desc
        />
      </Section>
      <Section title={`教育经历 (${data.education.length})`}>
        <ListEditor items={data.education as unknown as Record<string,string>[]} onChange={items => onChange({...data, education:items as unknown as ResumeData["education"]})}
          fields={[
            { key:"school", label:"学校", placeholder:"学校名称" },
            { key:"degree", label:"学位", placeholder:"本科/硕士" },
            { key:"major", label:"专业", placeholder:"专业" },
            { key:"startDate", label:"开始", placeholder:"2020.09" },
            { key:"endDate", label:"结束", placeholder:"2024.06" },
          ]}
        />
      </Section>
      <Section title={`项目经验 (${data.projects.length})`}>
        <ListEditor items={data.projects as unknown as Record<string,string>[]} onChange={items => onChange({...data, projects:items as unknown as ResumeData["projects"]})}
          fields={[
            { key:"name", label:"项目名", placeholder:"项目名称" },
            { key:"techStack", label:"技术栈", placeholder:"React, TypeScript" },
          ]}
          desc
        />
      </Section>
      <Section title={`技能 (${data.skills.length})`}>
        <SkillsEditor skills={data.skills} onChange={skills => onChange({...data, skills})} />
      </Section>
    </div>
  );
}

// ── Section wrapper ──
function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen??false);
  return (
    <div className="border rounded-lg">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 rounded-t-lg">
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}{title}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

// ── Basic fields ──
function BasicFields({ data, onChange }: Props) {
  const b = data.basic;
  const fields: { key: keyof typeof b; label: string; placeholder: string }[] = [
    { key:"name", label:"姓名", placeholder:"姓名" },
    { key:"title", label:"职位", placeholder:"职位/头衔" },
    { key:"email", label:"邮箱", placeholder:"email@example.com" },
    { key:"phone", label:"电话", placeholder:"138-0000-0000" },
    { key:"location", label:"所在地", placeholder:"城市" },
    { key:"website", label:"网站", placeholder:"https://..." },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(f => (
        <div key={f.key} className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
          <Input value={b[f.key]||""} onChange={e => onChange({...data, basic:{...b, [f.key]:e.target.value}})} placeholder={f.placeholder} className="h-8 text-xs" />
        </div>
      ))}
    </div>
  );
}

// ── List editor ──
function ListEditor<T extends Record<string,string>>({ items, onChange, fields, desc }: {
  items: T[]; onChange: (items: T[]) => void;
  fields: { key: string; label: string; placeholder: string }[];
  desc?: boolean;
}) {
  const add = () => onChange([...items, fields.reduce((o,f) => ({...o, [f.key]:""}), {} as T)]);
  const remove = (i: number) => onChange(items.filter((_,j) => j!==i));
  const update = (i: number, key: string, val: string) => {
    const next = [...items];
    next[i] = {...next[i], [key]:val};
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className={cn("border rounded-lg p-2 space-y-2", i>0 && "mt-2")}>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground flex-1">#{i+1}</span>
            <Button variant="ghost" size="sm" onClick={() => remove(i)} className="h-6 w-6 p-0"><Trash2 className="size-3 text-destructive"/></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {fields.map(f => (
              <div key={f.key} className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                <Input value={item[f.key]||""} onChange={e => update(i, f.key, e.target.value)} placeholder={f.placeholder} className="h-8 text-xs" />
              </div>
            ))}
          </div>
          {desc && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">描述</Label>
              <RichTextEditor value={item.description||""} onChange={v => update(i,"description",v)} minHeight="80px" placeholder="工作内容..." />
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="w-full gap-1 text-xs"><Plus className="size-3"/>添加</Button>
    </div>
  );
}

// ── Skills editor ──
function SkillsEditor({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => { const v = input.trim(); if (v && !skills.includes(v)) { onChange([...skills, v]); setInput(""); } };
  const remove = (i: number) => onChange(skills.filter((_,j) => j!==i));
  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {skills.map((s,i) => <Badge key={i} variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => remove(i)}>{s} <span className="text-[10px] opacity-50">×</span></Badge>)}
      </div>
      <div className="flex gap-1">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&(e.preventDefault(),add())} placeholder="输入技能后回车添加" className="h-8 text-xs" />
        <Button variant="outline" size="sm" onClick={add} className="h-8 text-xs">添加</Button>
      </div>
    </div>
  );
}
