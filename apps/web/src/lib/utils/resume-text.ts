/**
 * 简历数据 → 可读文本（用于把「我的简历」引用到 AI 对话时注入上下文）
 */

import type { ResumeData } from "@/lib/validators/resume.schema";

function dateRange(start?: string, end?: string): string {
  return [start, end].filter(Boolean).join("–");
}

export function resumeDataToText(data: ResumeData, title?: string): string {
  const lines: string[] = [];

  if (title) lines.push(`简历标题：${title}`);

  const b = data.basic ?? {};
  if (typeof b.name === "string" && b.name.trim()) lines.push(`姓名：${b.name.trim()}`);
  if (typeof b.title === "string" && b.title.trim()) lines.push(`求职意向：${b.title.trim()}`);
  if (typeof b.email === "string" && b.email.trim()) lines.push(`邮箱：${b.email.trim()}`);
  if (typeof b.phone === "string" && b.phone.trim()) lines.push(`电话：${b.phone.trim()}`);
  if (typeof b.location === "string" && b.location.trim()) lines.push(`城市：${b.location.trim()}`);

  if (typeof data.summary === "string" && data.summary.trim()) {
    lines.push("", "个人总结：", data.summary.trim());
  }

  const education = data.education ?? [];
  if (education.length > 0) {
    lines.push("", "教育经历：");
    for (const e of education) {
      const parts = [e.school, e.major, e.degree, dateRange(e.startDate, e.endDate)].filter(
        (x) => typeof x === "string" && x.trim(),
      );
      lines.push(`- ${parts.join(" | ")}`);
    }
  }

  const experience = data.experience ?? [];
  if (experience.length > 0) {
    lines.push("", "工作经历：");
    for (const e of experience) {
      lines.push(`- ${[e.company, e.title, dateRange(e.startDate, e.endDate)].filter((x) => x && x.trim()).join(" | ")}`);
      if (typeof e.description === "string" && e.description.trim()) lines.push(`  ${e.description.trim()}`);
      for (const h of e.highlights ?? []) lines.push(`  · ${h}`);
    }
  }

  const projects = data.projects ?? [];
  if (projects.length > 0) {
    lines.push("", "项目经验：");
    for (const p of projects) {
      lines.push(`- ${p.name}${typeof p.techStack === "string" && p.techStack.trim() ? `（${p.techStack.trim()}）` : ""}`);
      if (typeof p.description === "string" && p.description.trim()) lines.push(`  ${p.description.trim()}`);
      for (const h of p.highlights ?? []) lines.push(`  · ${h}`);
    }
  }

  const cats = Object.values(data.categorizedSkills ?? {}).flat();
  const skills = (data.skills ?? []).length > 0 ? data.skills : cats;
  if (skills.length > 0) lines.push("", `技能：${skills.join("、")}`);

  const highlights = data.highlights ?? [];
  if (highlights.length > 0) {
    lines.push("", "核心亮点：", ...highlights.map((h) => `- ${h}`));
  }

  return lines.join("\n");
}
