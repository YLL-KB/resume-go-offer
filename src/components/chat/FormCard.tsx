"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { X, Plus, Send } from "lucide-react";
import { randomUUID } from "@/lib/utils/uuid";

function stripId<T extends { id?: string }>(entry: T): Omit<T, "id"> {
  const { id: _, ...rest } = entry;
  void _;
  return rest;
}

// ── 表单类型 ──

export type FormType = "basic" | "education" | "experience" | "project" | "skills" | "summary";

interface FormCardProps {
  type: FormType;
  onSubmit: (type: FormType, data: Record<string, unknown>) => void;
  onCancel: () => void;
}

// ── 表单配置 ──

const FORM_LABELS: Record<FormType, string> = {
  basic: "基本信息",
  education: "教育经历",
  experience: "工作经历",
  project: "项目经验",
  skills: "技能标签",
  summary: "个人总结",
};

// ── 基本信息 ──

function BasicForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("");
  const [salary, setSalary] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">姓名 *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="张三" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">求职意向 *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="前端开发工程师" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">邮箱 *</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="zhang@example.com" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">电话</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="138xxxx" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">城市</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="北京" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">期望薪资</Label>
          <Input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="15k-25k / 面议" className="mt-1 h-9 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={() => onSubmit({ name, email, phone, location, title, salary })} disabled={!name || !email || !title}>
          <Send className="mr-1.5 size-3" />提交
        </Button>
      </div>
    </div>
  );
}

// ── 教育经历（支持多条）──

function EducationForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [entries, setEntries] = useState<Array<{ id: string; school: string; degree: string; major: string; startDate: string; endDate: string }>>([]);
  // 当前正在填写的条目
  const [school, setSchool] = useState("");
  const [degree, setDegree] = useState("");
  const [major, setMajor] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const addEntry = () => {
    if (!school.trim()) return;
    setEntries([...entries, { id: randomUUID(), school: school.trim(), degree: degree.trim(), major: major.trim(), startDate: startDate.trim(), endDate: endDate.trim() }]);
    setSchool(""); setDegree(""); setMajor(""); setStartDate(""); setEndDate("");
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleSubmit = () => {
    // 如果当前有正在填写的，先自动添加
    const allEntries = school.trim()
      ? [...entries, { id: randomUUID(), school: school.trim(), degree: degree.trim(), major: major.trim(), startDate: startDate.trim(), endDate: endDate.trim() }]
      : entries;
    onSubmit({ entries: allEntries.map(stripId) });
  };

  return (
    <div className="space-y-3">
      {/* 已添加的条目 */}
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{entry.school}</span>
                <span className="text-muted-foreground"> · {entry.degree || "学历"} · {entry.major}</span>
                {(entry.startDate || entry.endDate) && (
                  <span className="text-muted-foreground"> · {entry.startDate} ~ {entry.endDate}</span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => removeEntry(entry.id)}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 添加新条目 */}
      <div className="rounded-lg border bg-background p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          {entries.length === 0 ? "添加教育经历" : `已添加 ${entries.length} 条，继续添加`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">学校 *</Label>
            <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="清华大学" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">学历</Label>
            <Input value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="本科 / 硕士 / 博士" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">专业</Label>
            <Input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="计算机科学" className="mt-0.5 h-8 text-sm" />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">开始时间</Label>
              <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="2020.09" className="mt-0.5 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[11px]">结束时间</Label>
              <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="2024.06" className="mt-0.5 h-8 text-sm" />
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={addEntry} disabled={!school.trim()}>
          <Plus className="mr-1 size-3" />添加此条
        </Button>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={handleSubmit} disabled={entries.length === 0 && !school.trim()}>
          <Send className="mr-1.5 size-3" />提交{entries.length > 0 ? `（${entries.length + (school.trim() ? 1 : 0)} 条）` : ""}
        </Button>
      </div>
    </div>
  );
}

// ── 工作经历（支持多条）──

function ExperienceForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [entries, setEntries] = useState<Array<{ id: string; company: string; title: string; startDate: string; endDate: string; description: string }>>([]);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  const addEntry = () => {
    if (!company.trim()) return;
    setEntries([...entries, { id: randomUUID(), company: company.trim(), title: title.trim(), startDate: startDate.trim(), endDate: endDate.trim(), description: description.trim() }]);
    setCompany(""); setTitle(""); setStartDate(""); setEndDate(""); setDescription("");
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleSubmit = () => {
    const allEntries = company.trim()
      ? [...entries, { id: randomUUID(), company: company.trim(), title: title.trim(), startDate: startDate.trim(), endDate: endDate.trim(), description: description.trim() }]
      : entries;
    onSubmit({ entries: allEntries.map(stripId) });
  };

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between rounded-lg border bg-background px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{entry.company}{entry.title ? ` · ${entry.title}` : ""}</div>
                {(entry.startDate || entry.endDate) && (
                  <div className="text-xs text-muted-foreground">{entry.startDate} ~ {entry.endDate}</div>
                )}
                {entry.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</div>}
              </div>
              <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => removeEntry(entry.id)}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-background p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          {entries.length === 0 ? "添加工作经历" : `已添加 ${entries.length} 条，继续添加`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">公司 *</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="字节跳动" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">职位</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="前端开发工程师" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">开始时间</Label>
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="2022.03" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">结束时间</Label>
            <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="2024.06" className="mt-0.5 h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-[11px]">工作内容</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简单描述你的工作内容和成果" className="mt-0.5 h-16 text-sm" />
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={addEntry} disabled={!company.trim()}>
          <Plus className="mr-1 size-3" />添加此条
        </Button>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={handleSubmit} disabled={entries.length === 0 && !company.trim()}>
          <Send className="mr-1.5 size-3" />提交{entries.length > 0 ? `（${entries.length + (company.trim() ? 1 : 0)} 条）` : ""}
        </Button>
      </div>
    </div>
  );
}

// ── 项目经验（支持多条）──

function ProjectForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [entries, setEntries] = useState<Array<{ id: string; name: string; techStack: string; description: string; url: string; startDate: string; endDate: string }>>([]);
  const [name, setName] = useState("");
  const [techStack, setTechStack] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const addEntry = () => {
    if (!name.trim()) return;
    setEntries([...entries, { id: randomUUID(), name: name.trim(), techStack: techStack.trim(), description: description.trim(), url: url.trim(), startDate: startDate.trim(), endDate: endDate.trim() }]);
    setName(""); setTechStack(""); setDescription(""); setUrl(""); setStartDate(""); setEndDate("");
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleSubmit = () => {
    const allEntries = name.trim()
      ? [...entries, { id: randomUUID(), name: name.trim(), techStack: techStack.trim(), description: description.trim(), url: url.trim(), startDate: startDate.trim(), endDate: endDate.trim() }]
      : entries;
    onSubmit({ entries: allEntries.map(stripId) });
  };

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between rounded-lg border bg-background px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{entry.name}{entry.techStack ? ` · ${entry.techStack}` : ""}</div>
                {(entry.startDate || entry.endDate) && (
                  <div className="text-xs text-muted-foreground">{entry.startDate} ~ {entry.endDate}</div>
                )}
                {entry.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</div>}
                {entry.url && <div className="text-xs text-primary/70 mt-0.5 truncate">{entry.url}</div>}
              </div>
              <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => removeEntry(entry.id)}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-background p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          {entries.length === 0 ? "添加项目经验" : `已添加 ${entries.length} 条，继续添加`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">项目名称 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="电商后台管理系统" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">技术栈</Label>
            <Input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, TypeScript, Node.js" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">开始时间</Label>
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="2023.06" className="mt-0.5 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px]">结束时间</Label>
            <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="2024.03" className="mt-0.5 h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-[11px]">项目链接</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/..." className="mt-0.5 h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-[11px]">项目描述</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述项目内容和你的贡献" className="mt-0.5 h-16 text-sm" />
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={addEntry} disabled={!name.trim()}>
          <Plus className="mr-1 size-3" />添加此条
        </Button>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={handleSubmit} disabled={entries.length === 0 && !name.trim()}>
          <Send className="mr-1.5 size-3" />提交{entries.length > 0 ? `（${entries.length + (name.trim() ? 1 : 0)} 条）` : ""}
        </Button>
      </div>
    </div>
  );
}

// ── 技能标签 ──

function SkillsForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [input, setInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);

  const addSkill = () => {
    const s = input.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setInput("");
    }
  };

  const commonSkills = ["JavaScript", "TypeScript", "React", "Vue", "Node.js", "Python", "Go", "Java", "Docker", "Kubernetes", "MySQL", "Redis", "Git", "Figma"];

  return (
    <div className="space-y-3">
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1 pr-1">
              {s}
              <Button variant="ghost" size="icon" className="size-4 p-0" onClick={() => setSkills(skills.filter((x) => x !== s))}>
                <X className="size-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} placeholder="输入技能名称，回车添加" className="h-9 text-sm" />
        <Button size="sm" variant="outline" onClick={addSkill}><Plus className="size-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {commonSkills.filter((s) => !skills.includes(s)).map((s) => (
          <Badge key={s} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => setSkills([...skills, s])}>
            + {s}
          </Badge>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={() => onSubmit({ skills })} disabled={skills.length === 0}>
          <Send className="mr-1.5 size-3" />提交
        </Button>
      </div>
    </div>
  );
}

// ── 个人总结 ──

function SummaryForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [summary, setSummary] = useState("");
  return (
    <div className="space-y-3">
      <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="用 2-3 句话概括你的职业背景和核心竞争力..." className="h-24 text-sm" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={() => onSubmit({ summary })} disabled={!summary.trim()}>
          <Send className="mr-1.5 size-3" />提交
        </Button>
      </div>
    </div>
  );
}

// ── 主组件 ──

export function FormCard({ type, onSubmit, onCancel }: FormCardProps) {
  const handleSubmit = (data: Record<string, unknown>) => {
    onSubmit(type, data);
  };

  return (
    <div className="rounded-xl border border-gray-200/60 bg-white/70 backdrop-blur-xl p-4">
      <p className="mb-3 text-xs font-medium text-emerald-600">{FORM_LABELS[type]}</p>
      {type === "basic" && <BasicForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "education" && <EducationForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "experience" && <ExperienceForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "project" && <ProjectForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "skills" && <SkillsForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "summary" && <SummaryForm onSubmit={handleSubmit} onCancel={onCancel} />}
    </div>
  );
}
