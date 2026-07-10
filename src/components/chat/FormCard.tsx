"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { X, Plus, Send } from "lucide-react";

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

// ── 教育经历 ──

function EducationForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [school, setSchool] = useState("");
  const [degree, setDegree] = useState("");
  const [major, setMajor] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">学校 *</Label>
          <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="清华大学" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">专业</Label>
          <Input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="计算机科学" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">学历</Label>
          <Input value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="本科 / 硕士" className="mt-1 h-9 text-sm" />
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">开始时间</Label>
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="2020.09" className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">结束时间</Label>
            <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="2024.06" className="mt-1 h-9 text-sm" />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={() => onSubmit({ school, degree, major, startDate, endDate })} disabled={!school}>
          <Send className="mr-1.5 size-3" />提交
        </Button>
      </div>
    </div>
  );
}

// ── 工作经历 ──

function ExperienceForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">公司 *</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="字节跳动" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">职位</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="前端开发工程师" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">开始时间</Label>
          <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="2022.03" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">结束时间</Label>
          <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="2024.06" className="mt-1 h-9 text-sm" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">工作内容</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简单描述你的工作内容和成果" className="mt-1 h-20 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={() => onSubmit({ company, title, startDate, endDate, description })} disabled={!company}>
          <Send className="mr-1.5 size-3" />提交
        </Button>
      </div>
    </div>
  );
}

// ── 项目经验 ──

function ProjectForm({ onSubmit, onCancel }: { onSubmit: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [techStack, setTechStack] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">项目名称 *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="电商后台管理系统" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">技术栈</Label>
          <Input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, TypeScript, Node.js" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">项目链接</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/..." className="mt-1 h-9 text-sm" />
        </div>
        <div className="col-span-1" />
        <div className="col-span-2">
          <Label className="text-xs">项目描述</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述项目内容和你的贡献" className="mt-1 h-20 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>跳过</Button>
        <Button size="sm" onClick={() => onSubmit({ name, techStack, description, url })} disabled={!name}>
          <Send className="mr-1.5 size-3" />提交
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
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
      <p className="mb-3 text-xs font-medium text-primary">{FORM_LABELS[type]}</p>
      {type === "basic" && <BasicForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "education" && <EducationForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "experience" && <ExperienceForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "project" && <ProjectForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "skills" && <SkillsForm onSubmit={handleSubmit} onCancel={onCancel} />}
      {type === "summary" && <SummaryForm onSubmit={handleSubmit} onCancel={onCancel} />}
    </div>
  );
}
