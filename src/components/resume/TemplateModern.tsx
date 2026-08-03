"use client";

import { ResumeData } from "@/lib/validators/resume.schema";
import { MapPin, Mail, Phone, Globe, Calendar, Briefcase, FolderOpen, Star } from "lucide-react";

interface Props { data: ResumeData }

const SectionIcon = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="flex size-6 items-center justify-center rounded bg-primary/10">
      <Icon className="size-3.5 text-primary" />
    </div>
    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800">{label}</h2>
  </div>
);

export function TemplateModern({ data }: Props) {
  const { basic, summary, education, experience, projects, skills, highlights } = data as ResumeData & { highlights?: string[] };

  // ── 同公司经历合并 ──
  const norm = (name: string) => name.replace(/[（(][^)）]*[)）]/g, "").trim();
  const groupedExp: Array<{ company: string; roles: typeof experience }> = [];
  for (const exp of experience) {
    const key = norm(exp.company);
    const existing = groupedExp.find(g => norm(g.company) === key);
    if (existing) {
      if (norm(existing.company) !== existing.company && norm(exp.company) === exp.company) {
        existing.company = exp.company;
      }
      existing.roles.push(exp);
    } else {
      groupedExp.push({ company: exp.company, roles: [exp] });
    }
  }

  return (
    <div className="bg-gray-100 text-gray-800 max-w-[210mm] mx-auto font-sans text-sm leading-relaxed shadow-lg flex print:min-h-0">
      {/* ── Left Sidebar ── */}
      <aside className="w-[42%] bg-gray-900 text-white p-6 flex flex-col gap-5">
        {/* Avatar + Name */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-primary text-white text-xl font-bold">
            {(basic.name || "?").charAt(0)}
          </div>
          <h1 className="text-xl font-bold">{basic.name || "你的姓名"}</h1>
          {basic.title && <p className="text-primary-foreground/70 text-xs mt-1">{basic.title}</p>}
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">联系方式</h3>
          <div className="space-y-1.5 text-xs text-gray-300">
            {basic.email && <div className="flex items-center gap-2"><Mail className="size-3 text-gray-400" />{basic.email}</div>}
            {basic.phone && <div className="flex items-center gap-2"><Phone className="size-3 text-gray-400" />{basic.phone}</div>}
            {basic.location && <div className="flex items-center gap-2"><MapPin className="size-3 text-gray-400" />{basic.location}</div>}
            {basic.website && <div className="flex items-center gap-2"><Globe className="size-3 text-gray-400" />{basic.website}</div>}
          </div>
        </div>

        {/* Skills */}
        {skills.length > 0 && (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">技能</h3>
            <div className="space-y-1.5">
              {skills.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-gray-700">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${100 - i * 8}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 min-w-[60px]">{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education in sidebar */}
        {education.length > 0 && (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">教育</h3>
            {education.map((edu, i) => (
              <div key={i} className="mb-2 text-xs">
                <p className="font-medium text-white">{edu.school}</p>
                <p className="text-gray-400">{edu.degree} · {edu.major}</p>
                <p className="text-gray-500 text-[10px]">{edu.startDate} — {edu.endDate}</p>
              </div>
            ))}
          </div>
        )}

        {/* 个人亮点 — AI 从对话中捕捉的优点 */}
        {highlights && highlights.length > 0 && (
          <div className="mt-auto">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">个人亮点</h3>
            <ul className="space-y-1 text-[10px] text-gray-300">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Star className="size-2.5 text-primary/60 shrink-0 mt-0.5" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* ── Right Main Content ── */}
      <main className="flex-1 p-6 flex flex-col gap-4 bg-white">
        {/* Summary */}
        {summary && (
          <section>
            <p className="text-gray-600 text-xs leading-relaxed italic border-l-2 border-primary pl-3">{summary}</p>
          </section>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <section>
            <SectionIcon icon={Briefcase} label="工作经历" />
            <div className="space-y-3">
              {groupedExp.map((group, gi) => (
                <div key={gi} className="relative pl-4 border-l-2 border-gray-200 pb-2">
                  <div className="absolute top-0 left-[-5px] size-2.5 rounded-full bg-primary" />
                  {group.company && <h3 className="font-semibold text-sm">{group.company}</h3>}
                  {group.roles.map((role, ri) => (
                    <div key={ri} className={ri > 0 ? "mt-2 pt-2 border-t border-gray-100" : (group.company ? "mt-1" : "mt-0")}>
                      <div className="flex justify-between items-baseline">
                        <p className="text-xs text-primary/70 font-medium">{role.title}</p>
                        <span className="text-[10px] text-gray-400 flex items-center gap-1 shrink-0 ml-2">
                          <Calendar className="size-2.5" />{role.startDate} — {role.endDate || "至今"}
                        </span>
                      </div>
                      {role.description && <p className="text-gray-600 mt-0.5 text-xs">{role.description}</p>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <section>
            <SectionIcon icon={FolderOpen} label="项目经验" />
            <div className="space-y-2">
              {projects.map((proj, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-3">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-semibold text-sm">{proj.name}</h3>
                    {proj.url && <a href={proj.url} className="text-[10px] text-primary underline" target="_blank">链接</a>}
                  </div>
                  {proj.techStack && <p className="text-[10px] text-gray-500 mt-0.5">{proj.techStack}</p>}
                  {proj.description && <p className="text-gray-600 mt-1 text-xs">{proj.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
