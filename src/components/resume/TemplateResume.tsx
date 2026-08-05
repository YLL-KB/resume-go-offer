"use client";

import { ResumeData } from "@/lib/validators/resume.schema";

export type ResumeTheme = "ocean" | "forest" | "slate" | "warm";

interface TemplateResumeProps {
  data: ResumeData;
  skillsHtml?: string | null;
  theme?: ResumeTheme;
}

interface ThemeConfig {
  name: string;
  primary: string;      // 标题下划线、强调图标、section 标题
  primaryLight: string;  // summary 边框、链接色
  primaryBg: string;     // summary 背景
  secondary: string;     // 项目名
  pageBg: string;        // 页面底色
  textMain: string;      // 正文
  textMuted: string;     // 辅助文字
  border: string;        // h2 下划线
}

export const THEMES: Record<ResumeTheme, ThemeConfig> = {
  ocean: {
    name: "海蓝经典",
    primary: "#2563eb",
    primaryLight: "#2563eb",
    primaryBg: "#fafafa",
    secondary: "#7c3aed",
    pageBg: "#ffffff",
    textMain: "#333333",
    textMuted: "#6b7280",
    border: "#2563eb",
  },
  forest: {
    name: "墨绿自然",
    primary: "#059669",
    primaryLight: "#059669",
    primaryBg: "#f9fafb",
    secondary: "#0891b2",
    pageBg: "#ffffff",
    textMain: "#334155",
    textMuted: "#94a3b8",
    border: "#059669",
  },
  slate: {
    name: "暗夜专业",
    primary: "#4f46e5",
    primaryLight: "#6366f1",
    primaryBg: "#f8fafc",
    secondary: "#0f172a",
    pageBg: "#ffffff",
    textMain: "#1e293b",
    textMuted: "#94a3b8",
    border: "#4f46e5",
  },
  warm: {
    name: "暖棕稳重",
    primary: "#b45309",
    primaryLight: "#b45309",
    primaryBg: "#fefdf8",
    secondary: "#92400e",
    pageBg: "#ffffff",
    textMain: "#44403c",
    textMuted: "#a8a29e",
    border: "#b45309",
  },
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "AI / LLM":       { bg: "#eff6ff", text: "#1e40af" },
  "前端基础":       { bg: "#fef2f2", text: "#991b1b" },
  "UI 生态":        { bg: "#f0fdf4", text: "#166534" },
  "工程化":         { bg: "#fefce8", text: "#854d0e" },
  "全栈 / 移动端":  { bg: "#faf5ff", text: "#5b21b6" },
};

/** 数字高亮：给文本中的数字包裹 <strong> 标签 */
function highlightNumbers(text: unknown): string {
  if (typeof text !== "string") return String(text ?? "");
  return text.replace(/(\d+(?:\.\d+)?%?)/g, '<strong style="color:#1e40af">$1</strong>');
}

/** 内联技能渲染（无 AI HTML 时的 fallback） */
function InlineSkills({ data }: { data: ResumeData }) {
  const cats = data.categorizedSkills;
  if (!cats || Object.keys(cats).length === 0) {
    // 无分类时，简单列出所有技能
    if (!data.skills || data.skills.length === 0) return null;
    return (
      <div className="skills-fallback flex flex-wrap gap-1.5">
        {data.skills.map((s) => (
          <span key={s} className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[10pt] text-gray-700">{s}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="skills-fallback space-y-1.5">
      {Object.entries(cats).map(([cat, skills]) => {
        if (!skills || skills.length === 0) return null;
        const colors = CATEGORY_COLORS[cat] ?? { bg: "#f3f4f6", text: "#374151" };
        return (
          <div key={cat} className="flex items-baseline gap-2 text-[10pt]">
            <span
              className="shrink-0 rounded px-1.5 py-px text-[9pt] font-semibold"
              style={{ background: colors.bg, color: colors.text }}
            >
              {cat}
            </span>
            <span className="text-gray-600">{skills.join(" · ")}</span>
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

  // ── 渲染端保险：过滤掉与 description 重复的 highlight，避免同一句话出现两边 ──
  const dedupeHighlights = (desc: string | undefined, hl: string[] | undefined): string[] => {
    if (!hl || hl.length === 0) return [];
    const base = (desc ?? "").replace(/[\s，。、；：（）()]/g, "");
    const seen = new Set<string>(); // 去重（去掉空白后比较）
    return hl.filter((h) => {
      const key = h.replace(/[\s，。、；：（）()]/g, "");
      if (seen.has(key)) return false; // 与前一条 highlight 重复
      seen.add(key);
      return !(key.length > 6 && base.includes(key)); // 与 description 高度重叠则丢弃
    });
  };

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0.8cm 0 0 0; }
        html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .resume-body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 10pt; line-height: 1.6; color: ${t.textMain}; }
        .resume-body h2 { font-size: 12pt; font-weight: bold; color: #1a1a1a; margin: 0 0 10px 0; display: inline-block; border-bottom: 1.5px solid ${t.border}; padding-bottom: 3px; }
        .resume-body .exp-block li::before { color: ${t.primary}; }
        .resume-body .proj li::before { color: ${t.secondary}; }
        @media print {
          .resume-section { break-inside: avoid; }
          .proj, .exp-block { break-inside: avoid; }
        }
      `}</style>

      <div className="resume-body page w-full mx-auto bg-white text-gray-900 px-[2cm]" style={{ color: t.textMain }}>
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
            <p dangerouslySetInnerHTML={{ __html: highlightNumbers(summary) }} />
          </section>
        )}

        {/* ── 亮点标签 ── */}
        {hasHighlights && (
          <section className="mb-4 space-y-1.5">
            {dedupeHighlights("", highlights).map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-[9pt] text-gray-700"
              >
                <span className="mt-0.5 shrink-0 font-bold" style={{ color: t.primary }}>▸</span>
                <span dangerouslySetInnerHTML={{ __html: highlightNumbers(h) }} />
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
            <InlineSkills data={data} />
          )}
        </section>

        {/* ── 工作经历 ── */}
        {hasExperience && (
          <section className="resume-section mb-5">
            <h2>工作经历</h2>
            {(experience ?? []).map((exp, i) => (
              <div key={i} className="exp-block mb-3">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[10.5pt] font-semibold text-gray-800">{exp.title}</span>
                  {(exp.startDate || exp.endDate) && (
                    <span className="text-[9pt] text-gray-500 shrink-0 ml-2">{exp.startDate} – {exp.endDate || "至今"}</span>
                  )}
                </div>
                {exp.company && <p className="text-[9.5pt] text-gray-500 mb-1">{exp.company}</p>}
                {exp.description && (
                  <p className="text-[10pt] mb-1" style={{ color: t.textMuted }} dangerouslySetInnerHTML={{ __html: highlightNumbers(exp.description) }} />
                )}
                {dedupeHighlights(exp.description, exp.highlights).length > 0 && (
                  <ul className="list-none pl-0">
                    {dedupeHighlights(exp.description, exp.highlights).map((h, j) => (
                      <li key={j} className="relative pl-4 mb-0.5 text-[10pt] text-gray-700 before:content-['●'] before:absolute before:left-0 before:text-[#2563eb]"
                        dangerouslySetInnerHTML={{ __html: highlightNumbers(h) }}
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
                  {(p.startDate || p.endDate) && <span className="text-[9pt] font-normal text-gray-400 ml-2">{p.startDate} – {p.endDate || "至今"}</span>}
                </h3>
                {p.techStack && <p className="text-[9pt] text-gray-500 mb-1">{p.techStack}</p>}
                {p.description && (
                  <p className="text-[10pt] mb-1" style={{ color: t.textMuted }} dangerouslySetInnerHTML={{ __html: highlightNumbers(p.description) }} />
                )}
                {dedupeHighlights(p.description, p.highlights).length > 0 && (
                  <ul className="list-none pl-0">
                    {dedupeHighlights(p.description, p.highlights).map((h, j) => (
                      <li key={j} className="relative pl-4 mb-0.5 text-[10pt] text-gray-700 before:content-['●'] before:absolute before:left-0"
                        style={{ color: t.textMain }}
                        dangerouslySetInnerHTML={{ __html: highlightNumbers(h) }}
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
                  <span className="text-[10pt] font-normal text-gray-500 ml-2">{edu.major} · {edu.degree}</span>
                </h3>
                {(edu.startDate || edu.endDate) && (
                  <p className="text-[9pt] text-gray-500">{edu.startDate} – {edu.endDate}</p>
                )}
                {edu.gpa && <p className="text-[9pt] text-gray-500">GPA: {edu.gpa}</p>}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
