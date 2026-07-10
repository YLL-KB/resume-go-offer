"use client";

import { ResumeData } from "@/lib/validators/resume.schema";
import { MapPin, Mail, Phone, Globe, Calendar, Briefcase, FolderOpen } from "lucide-react";

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
  const { basic, summary, education, experience, projects, skills } = data;

  return (
    <div className="bg-white text-gray-800 min-h-[297mm] max-w-[210mm] mx-auto font-sans text-sm leading-relaxed shadow-lg flex">
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
      </aside>

      {/* ── Right Main Content ── */}
      <main className="flex-1 p-6 flex flex-col gap-4">
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
              {experience.map((exp, i) => (
                <div key={i} className="relative pl-4 border-l-2 border-gray-200 pb-2">
                  <div className="absolute top-0 left-[-5px] size-2.5 rounded-full bg-primary" />
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-semibold text-sm">{exp.company}</h3>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1"><Calendar className="size-2.5" />{exp.startDate} — {exp.endDate || "至今"}</span>
                  </div>
                  <p className="text-xs text-primary/70 font-medium">{exp.title}</p>
                  {exp.description && <p className="text-gray-600 mt-1 text-xs">{exp.description}</p>}
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
