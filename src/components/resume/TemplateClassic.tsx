"use client";

import { ResumeData } from "@/lib/validators/resume.schema";
import { MapPin, Mail, Phone, Globe } from "lucide-react";

interface TemplateClassicProps {
  data: ResumeData;
}

export function TemplateClassic({ data }: TemplateClassicProps) {
  const { basic, summary, education, experience, projects, skills } = data;

  return (
    <div className="bg-white text-gray-900 p-8 font-sans min-h-[297mm] max-w-[210mm] mx-auto text-sm leading-relaxed shadow-lg print:shadow-none">
      {/* Header */}
      <header className="text-center pb-4 border-b border-gray-300">
        <h1 className="text-2xl font-bold tracking-tight">{basic.name || "你的姓名"}</h1>
        {basic.title && <p className="text-base text-gray-600 mt-1">{basic.title}</p>}
        <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs text-gray-500">
          {basic.email && (
            <span className="inline-flex items-center gap-1"><Mail className="size-3" />{basic.email}</span>
          )}
          {basic.phone && (
            <span className="inline-flex items-center gap-1"><Phone className="size-3" />{basic.phone}</span>
          )}
          {basic.location && (
            <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{basic.location}</span>
          )}
          {basic.website && (
            <span className="inline-flex items-center gap-1"><Globe className="size-3" />{basic.website}</span>
          )}
        </div>
      </header>

      {/* Summary */}
      {summary && (
        <section className="py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-1">个人总结</h2>
          <p className="text-gray-600">{summary}</p>
        </section>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <section className="py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-2">工作经历</h2>
          {experience.map((exp, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between items-baseline">
                <h3 className="font-semibold">{exp.company}</h3>
                <span className="text-xs text-gray-500">
                  {exp.startDate} — {exp.endDate || "至今"}
                </span>
              </div>
              <p className="text-gray-600 text-xs italic">{exp.title}</p>
              {exp.description && <p className="text-gray-600 mt-1 text-xs">{exp.description}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-2">项目经验</h2>
          {projects.map((proj, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between items-baseline">
                <h3 className="font-semibold">{proj.name}</h3>
                {proj.url && (
                  <a href={proj.url} className="text-xs text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                    链接
                  </a>
                )}
              </div>
              {proj.techStack && <p className="text-xs text-gray-500">{proj.techStack}</p>}
              {proj.description && <p className="text-gray-600 mt-1 text-xs">{proj.description}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Education */}
      {education.length > 0 && (
        <section className="py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-2">教育经历</h2>
          {education.map((edu, i) => (
            <div key={i} className="mb-2">
              <div className="flex justify-between items-baseline">
                <h3 className="font-semibold">{edu.school}</h3>
                <span className="text-xs text-gray-500">
                  {edu.startDate} — {edu.endDate}
                </span>
              </div>
              <p className="text-gray-600 text-xs">
                {edu.degree} · {edu.major}
                {edu.gpa && ` · GPA ${edu.gpa}`}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <section className="py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-2">技能</h2>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill, i) => (
              <span key={i} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!summary && !experience.length && !education.length && !projects.length && !skills.length && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          在左侧填写信息后，这里会实时预览简历
        </div>
      )}
    </div>
  );
}
