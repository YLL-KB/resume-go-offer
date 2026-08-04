/**
 * 技能区块 HTML 生成（纯模板，无需 AI）
 *
 * 替代 AI generateSkillsHtml，将 render-skills 从 10-30s 降到 <1ms。
 * 支持 resume-styles-kit 的 A/B/D 三种风格。
 */

const CAT_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  "AI / LLM":       { bg: "#eff6ff", text: "#1e40af", accent: "#3b82f6" },
  "前端基础":       { bg: "#fef2f2", text: "#991b1b", accent: "#ef4444" },
  "UI 生态":        { bg: "#f0fdf4", text: "#166534", accent: "#22c55e" },
  "工程化":         { bg: "#fefce8", text: "#854d0e", accent: "#eab308" },
  "全栈 / 移动端":  { bg: "#faf5ff", text: "#5b21b6", accent: "#8b5cf6" },
};

const DEFAULT_COLOR = { bg: "#f3f4f6", text: "#374151", accent: "#6b7280" };

function catColor(cat: string) {
  return CAT_COLORS[cat] ?? DEFAULT_COLOR;
}

/** 过滤空分类 */
function nonEmpty(cats: Record<string, string[]>) {
  return Object.entries(cats).filter(([, skills]) => skills.length > 0);
}

// ── A 双栏分类式 ──

function styleA(cats: Record<string, string[]>) {
  const items = nonEmpty(cats).map(([cat, skills]) => {
    const c = catColor(cat);
    return `<div class="skill-item" style="font-size:10.5pt;line-height:1.5"><span style="color:${c.accent}">▍</span> <b>${cat}</b>：${skills.join("、")}</div>`;
  });
  return `<div class="skills-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 1.5rem">${items.join("")}</div>`;
}

// ── B 侧栏 pill 式 ──

function styleB(cats: Record<string, string[]>) {
  const rows = nonEmpty(cats).map(([cat, skills]) => {
    const c = catColor(cat);
    return `<div class="skill-row" style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.3rem"><span class="skill-pill" style="background:${c.bg};color:${c.text};border-radius:3px;padding:0.1rem 0.5rem;font-size:9pt;font-weight:600;white-space:nowrap">${cat}</span><span class="skill-desc" style="font-size:10pt;color:#555">${skills.join(" · ")}</span></div>`;
  });
  return `<div class="skills-section">${rows.join("")}</div>`;
}

// ── D 标签云式 ──

function styleD(cats: Record<string, string[]>) {
  const tags: string[] = [];
  for (const [cat, skills] of nonEmpty(cats)) {
    const c = catColor(cat);
    skills.forEach((skill, i) => {
      tags.push(`<span class="tag" style="padding:0.15rem 0.6rem;border-radius:20px;font-size:9.5pt;font-weight:${i === 0 ? "600" : "500"};background:${c.bg};color:${c.text}">${skill}</span>`);
    });
  }
  return `<div class="tag-cloud" style="display:flex;flex-wrap:wrap;gap:0.35rem">${tags.join("")}</div>`;
}

// ── 导出 ──

export type SkillStyle = "A" | "B" | "D";

const RENDERERS: Record<SkillStyle, (cats: Record<string, string[]>) => string> = {
  A: styleA,
  B: styleB,
  D: styleD,
};

/** 根据技能分类 + 风格生成技能区块 HTML（纯模板，<1ms） */
export function renderSkillsHtml(
  categorizedSkills: Record<string, string[]>,
  style: SkillStyle = "B",
): string {
  return RENDERERS[style](categorizedSkills);
}
