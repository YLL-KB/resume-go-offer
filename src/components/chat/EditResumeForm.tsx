"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { ResumeData } from "@/stores/chat-store";

type EditSection = "basic" | "education" | "experience" | "projects" | "skills" | "summary";

// ── 基本信息编辑 ──

function BasicEditor({ data, onSave }: { data: ResumeData; onSave: (d: ResumeData) => void }) {
  const [name, setName] = useState(data.basic.name ?? "");
  const [email, setEmail] = useState(data.basic.email ?? "");
  const [phone, setPhone] = useState(data.basic.phone ?? "");
  const [location, setLocation] = useState(data.basic.location ?? "");
  const [title, setTitle] = useState(data.basic.title ?? "");

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-background">
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">姓名</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 text-sm" /></div>
        <div><Label className="text-xs">求职意向</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-8 text-sm" /></div>
        <div><Label className="text-xs">邮箱</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-8 text-sm" /></div>
        <div><Label className="text-xs">电话</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-8 text-sm" /></div>
        <div><Label className="text-xs">城市</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 h-8 text-sm" /></div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => onSave({ ...data, basic: { ...data.basic, name, email, phone, location, title } })}>保存</Button>
      </div>
    </div>
  );
}

// ── 教育经历编辑 ──

function EducationEditor({ data, onSave }: { data: ResumeData; onSave: (d: ResumeData) => void }) {
  const [items, setItems] = useState(data.education.length > 0 ? [...data.education] : [{ school: "", degree: "", major: "", startDate: "", endDate: "", gpa: "" }]);

  const update = (i: number, f: string, v: string) => {
    const next = [...items];
    next[i] = { ...next[i], [f]: v };
    setItems(next);
  };
  const add = () => setItems([...items, { school: "", degree: "", major: "", startDate: "", endDate: "", gpa: "" }]);
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-background">
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 p-2 border rounded relative">
          <Button variant="ghost" size="icon" className="absolute top-1 right-1 size-6" onClick={() => remove(i)}><X className="size-3" /></Button>
          <div><Label className="text-xs">学校</Label><Input value={item.school} onChange={(e) => update(i, "school", e.target.value)} className="mt-1 h-8 text-sm" /></div>
          <div><Label className="text-xs">专业</Label><Input value={item.major} onChange={(e) => update(i, "major", e.target.value)} className="mt-1 h-8 text-sm" /></div>
          <div><Label className="text-xs">学历</Label><Input value={item.degree} onChange={(e) => update(i, "degree", e.target.value)} className="mt-1 h-8 text-sm" /></div>
          <div><Label className="text-xs">时间</Label><Input value={`${item.startDate ?? ""} - ${item.endDate ?? ""}`} onChange={(ev) => { const [start, end] = ev.target.value.split("-").map((x: string) => x.trim()); update(i, "startDate", start ?? ""); if (end) update(i, "endDate", end); }} className="mt-1 h-8 text-sm" placeholder="2020.09 - 2024.06" /></div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-3 mr-1" />添加</Button>
        <Button size="sm" onClick={() => onSave({ ...data, education: items.filter((x) => x.school).map((x) => ({ ...x, gpa: x.gpa ?? "" })) })}>保存</Button>
      </div>
    </div>
  );
}

// ── 工作经历编辑 ──

function ExperienceEditor({ data, onSave }: { data: ResumeData; onSave: (d: ResumeData) => void }) {
  const [items, setItems] = useState(data.experience.length > 0 ? [...data.experience] : [{ company: "", title: "", startDate: "", endDate: "", description: "", highlights: [] as string[] }]);

  const update = (i: number, f: string, v: string) => {
    const next = [...items];
    next[i] = { ...next[i], [f]: v };
    setItems(next);
  };
  const add = () => setItems([...items, { company: "", title: "", startDate: "", endDate: "", description: "", highlights: [] as string[] }]);
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-background">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 p-2 border rounded relative">
          <Button variant="ghost" size="icon" className="absolute top-1 right-1 size-6" onClick={() => remove(i)}><X className="size-3" /></Button>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">公司</Label><Input value={item.company} onChange={(e) => update(i, "company", e.target.value)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs">职位</Label><Input value={item.title} onChange={(e) => update(i, "title", e.target.value)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs">开始</Label><Input value={item.startDate ?? ""} onChange={(e) => update(i, "startDate", e.target.value)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs">结束</Label><Input value={item.endDate ?? ""} onChange={(e) => update(i, "endDate", e.target.value)} className="mt-1 h-8 text-sm" /></div>
          </div>
          <div><Label className="text-xs">工作内容</Label><Textarea value={item.description ?? ""} onChange={(e) => update(i, "description", e.target.value)} className="mt-1 h-20 text-sm" /></div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-3 mr-1" />添加</Button>
        <Button size="sm" onClick={() => onSave({ ...data, experience: items.filter((x) => x.company).map((x) => ({ ...x, highlights: x.highlights ?? [] as string[] })) })}>保存</Button>
      </div>
    </div>
  );
}

// ── 技能编辑 ──

function SkillsEditor({ data, onSave }: { data: ResumeData; onSave: (d: ResumeData) => void }) {
  const [input, setInput] = useState("");
  const [skills, setSkills] = useState<string[]>([...data.skills]);

  const add = () => {
    const s = input.trim();
    if (s && !skills.includes(s)) { setSkills([...skills, s]); setInput(""); }
  };

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-background">
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <Badge key={s} variant="secondary" className="gap-1 pr-1">{s}<Button variant="ghost" size="icon" className="size-4 p-0 hover:bg-transparent" onClick={() => setSkills(skills.filter((x) => x !== s))}><X className="size-3" /></Button></Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="输入技能" className="h-8 text-sm" />
        <Button size="sm" variant="outline" onClick={add}><Plus className="size-4" /></Button>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => onSave({ ...data, skills })}>保存</Button>
      </div>
    </div>
  );
}

// ── 个人总结编辑 ──

function SummaryEditor({ data, onSave }: { data: ResumeData; onSave: (d: ResumeData) => void }) {
  const [summary, setSummary] = useState(data.summary ?? "");

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-background">
      <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="用 2-3 句话概括..." className="h-24 text-sm" />
      <div className="flex justify-end">
        <Button size="sm" onClick={() => onSave({ ...data, summary })}>保存</Button>
      </div>
    </div>
  );
}

// ── 主组件：编辑面板 ──

const SECTIONS: { key: EditSection; label: string }[] = [
  { key: "basic", label: "基本信息" },
  { key: "education", label: "教育经历" },
  { key: "experience", label: "工作经历" },
  { key: "projects", label: "项目经验" },
  { key: "skills", label: "技能标签" },
  { key: "summary", label: "个人总结" },
];

export function EditResumeForm({ data, onSave }: { data: ResumeData; onSave: (d: ResumeData) => void }) {
  const [section, setSection] = useState<EditSection | null>(null);

  return (
    <div className="space-y-2">
      {/* 编辑面板按钮 */}
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map(({ key, label }) => (
          <Button
            key={key}
            variant={section === key ? "default" : "outline"}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setSection(section === key ? null : key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* 编辑表单 */}
      {section === "basic" && <BasicEditor data={data} onSave={(d) => { onSave(d); setSection(null); }} />}
      {section === "education" && <EducationEditor data={data} onSave={(d) => { onSave(d); setSection(null); }} />}
      {section === "experience" && <ExperienceEditor data={data} onSave={(d) => { onSave(d); setSection(null); }} />}
      {section === "projects" && <EducationEditor data={data} onSave={(d) => { onSave(d); setSection(null); }} />}
      {section === "skills" && <SkillsEditor data={data} onSave={(d) => { onSave(d); setSection(null); }} />}
      {section === "summary" && <SummaryEditor data={data} onSave={(d) => { onSave(d); setSection(null); }} />}
    </div>
  );
}
