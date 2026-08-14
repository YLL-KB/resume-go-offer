"use client";

import { ResumeData } from "@/lib/validators/resume.schema";
import { getCatColor, THEMES, type ThemeConfig } from "@/lib/theme-utils";

// 从纯工具模块重导出，服务端 API 路由也可直接 import theme-utils
export { type ResumeTheme, THEMES } from "@/lib/theme-utils";

interface TemplateResumeProps {
  data: ResumeData;
  skillsHtml?: string | null;
  theme?: import("@/lib/theme-utils").ResumeTheme;
}

/** 数字高亮：给文本中的数字包裹 <strong> 标签 */
function highlightNumbers(text: unknown, primaryColor: string): string {
  if (typeof text !== "string") return String(text ?? "");
  return text.replace(/(\d+(?:\.\d+)?%?)/g, `<strong style="color:${primaryColor}">$1</strong>`);
}

/** 内联技能渲染（无 AI HTML 时的 fallback） */
function InlineSkills({ data, t }: { data: ResumeData; t: ThemeConfig }) {
  const cats = data.categorizedSkills;
  if (!cats || Object.keys(cats).length === 0) {
    if (!data.skills || data.skills.length === 0) return null;
    return (
      <div className="skills-fallback flex flex-wrap gap-1.5">
        {data.skills.map((s) => (
          <span
            key={s}
            className="inline-block rounded px-2 py-0.5 text-[10pt]"
            style={{ background: t.primaryBg, color: t.textMuted }}
          >
            {s}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="skills-fallback space-y-1.5">
      {Object.entries(cats).map(([cat, skills]) => {
        if (!skills || skills.length === 0) return null;
        const colors = getCatColor(cat, t.catColors);
        return (
          <div key={cat} className="flex items-baseline gap-2 text-[10pt]">
            <span
              className="shrink-0 rounded px-1.5 py-px text-[9pt] font-semibold"
              style={{ background: colors.bg, color: colors.text }}
            >
              {cat}
            </span>
            <span style={{ color: t.textMuted }}>{skills.join(" · ")}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TemplateResume({ data, skillsHtml, theme = "ocean" }: TemplateResumeProps) {
  const { basic, summary, education, experience, projects, highlights } = data;
  const t = THEMES[theme] ?? THEMES.ocean;

  const hasHighlights = highlights && highlights.length > 0;
  const hasProjects = projects && projects.length > 0;
  const hasExperience = experience && experience.length > 0;
  const hasEducation = education && education.length > 0;

  const dedupeHighlights = (desc: string | undefined, hl: string[] | undefined): string[] => {
    if (!hl || hl.length === 0) return [];
    const base = (desc ?? "").replace(/[\s，。、；：（）()]/g, "");
    const seen = new Set<string>();
    return hl.filter((h) => {
      const key = h.replace(/[\s，。、；：（）()]/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return !(key.length > 6 && base.includes(key));
    });
  };

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0.8cm 0 0 0; }
        html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .resume-body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 10pt; line-height: 1.6; color: ${t.textMain}; }
        .resume-body h2 { font-size: 12pt; font-weight: bold; color: ${t.textMain}; margin: 0 0 10px 0; display: inline-block; border-bottom: 1.5px solid ${t.border}; padding-bottom: 3px; }
        .resume-body .exp-block li::before { color: ${t.primary}; }
        .resume-body .proj li::before { color: ${t.secondary}; }
        @media print {
          .resume-section { break-inside: avoid; }
          .proj, .exp-block { break-inside: avoid; }
        }
      `}</style>

      <div className="resume-body page w-full mx-auto bg-white px-[2cm]" style={{ color: t.textMain }}>
        {/* ── 个人信息 ── */}
        <header className="mb-4">
          <h1 className="!text-[20pt] !font-bold !mb-1 !border-none">{basic.name || "姓名"}</h1>
          {basic.title && <p className="text-[11pt] mb-2" style={{ color: t.primary }}>{basic.title}</p>}
          <p className="text-[10pt]" style={{ color: t.textMuted }}>
            {[basic.email, basic.phone, basic.location].filter(Boolean).join("  |  ")}
          </p>
        </header>

        {/* ── 个人总结 ── */}
        {summary && (
          <section className="mb-4 p-3 text-[10pt]" style={{ background: t.primaryBg, borderLeft: `3px solid ${t.primaryLight}`, color: t.textMuted }}>
            <p dangerouslySetInnerHTML={{ __html: highlightNumbers(summary, t.primary) }} />
          </section>
        )}

        {/* ── 亮点标签 ── */}
        {hasHighlights && (
          <section className="mb-4 space-y-1.5">
            {dedupeHighlights("", highlights).map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-[9pt]"
                style={{ color: t.textMain }}
              >
                <span className="mt-0.5 shrink-0 font-bold" style={{ color: t.primary }}>▸</span>
                <span dangerouslySetInnerHTML={{ __html: highlightNumbers(h, t.primary) }} />
              </div>
            ))}
          </section>
        )}

        {/* ── 专业技能 (AI 生成 HTML 或 fallback) ── */}
        <section className="resume-section mb-5">
          <h2>专业技能</h2>
          {skillsHtml ? (
            <div dangerouslySetInnerHTML={{ __html: skillsHtml }} />
          ) : (
            <InlineSkills data={data} t={t} />
          )}
        </section>

        {/* ── 工作经历 ── */}
        {hasExperience && (
          <section className="resume-section mb-5">
            <h2>工作经历</h2>
            {(experience ?? []).map((exp, i) => (
              <div key={i} className="exp-block mb-3">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[10.5pt] font-semibold" style={{ color: t.textMain }}>{exp.title}</span>
                  {(exp.startDate || exp.endDate) && (
                    <span className="text-[9pt] shrink-0 ml-2" style={{ color: t.textMuted }}>{exp.startDate} – {exp.endDate || "至今"}</span>
                  )}
                </div>
                {exp.company && <p className="text-[9.5pt] mb-1" style={{ color: t.textMuted }}>{exp.company}</p>}
                {exp.description && (
                  <p className="text-[10pt] mb-1" style={{ color: t.textMuted }} dangerouslySetInnerHTML={{ __html: highlightNumbers(exp.description, t.primary) }} />
                )}
                {dedupeHighlights(exp.description, exp.highlights).length > 0 && (
                  <ul className="list-none pl-0">
                    {dedupeHighlights(exp.description, exp.highlights).map((h, j) => (
                      <li
                        key={j}
                        className="relative pl-4 mb-0.5 text-[10pt] before:content-['●'] before:absolute before:left-0"
                        style={{ color: t.textMain }}
                        dangerouslySetInnerHTML={{ __html: highlightNumbers(h, t.primary) }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── 项目经历 ── */}
        {hasProjects && (
          <section className="resume-section mb-5">
            <h2>项目经历</h2>
            {projects.map((p, i) => (
              <div key={i} className="proj mb-3">
                <h3 className="text-[11pt] font-bold mb-0.5" style={{ color: t.secondary }}>
                  {p.name}
                  {(p.startDate || p.endDate) && <span className="text-[9pt] font-normal ml-2" style={{ color: t.textMuted }}>{p.startDate} – {p.endDate || "至今"}</span>}
                </h3>
                {p.techStack && <p className="text-[9pt] mb-1" style={{ color: t.textMuted }}>{p.techStack}</p>}
                {p.description && (
                  <p className="text-[10pt] mb-1" style={{ color: t.textMuted }} dangerouslySetInnerHTML={{ __html: highlightNumbers(p.description, t.primary) }} />
                )}
                {dedupeHighlights(p.description, p.highlights).length > 0 && (
                  <ul className="list-none pl-0">
                    {dedupeHighlights(p.description, p.highlights).map((h, j) => (
                      <li
                        key={j}
                        className="relative pl-4 mb-0.5 text-[10pt] before:content-['●'] before:absolute before:left-0"
                        style={{ color: t.textMain }}
                        dangerouslySetInnerHTML={{ __html: highlightNumbers(h, t.primary) }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── 教育背景 ── */}
        {hasEducation && (
          <section className="resume-section mb-5">
            <h2>教育背景</h2>
            {education.map((edu, i) => (
              <div key={i} className="mb-2">
                <h3 className="text-[11pt] font-bold">
                  {edu.school}
                  <span className="text-[10pt] font-normal ml-2" style={{ color: t.textMuted }}>{edu.major} · {edu.degree}</span>
                </h3>
                {(edu.startDate || edu.endDate) && (
                  <p className="text-[9pt]" style={{ color: t.textMuted }}>{edu.startDate} – {edu.endDate}</p>
                )}
                {edu.gpa && <p className="text-[9pt]" style={{ color: t.textMuted }}>GPA: {edu.gpa}</p>}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
