/**
 * 技能区块 HTML 生成（纯模板，无需 AI）
 *
 * 三种风格各有鲜明视觉语言：
 *   A 双栏分类 — 紧凑文档风，信息密度高
 *   B 侧栏Pill  — 现代标签风，pill 突出、行间呼吸
 *   D 标签云    — 创意云朵风，大小错落、填充/描边混排
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

function nonEmpty(cats: Record<string, string[]>) {
  return Object.entries(cats).filter(([, skills]) => skills.length > 0);
}

// ── A 双栏分类 — 紧凑文档风 ──
// 两栏网格，小号字体，分类名用彩色竖线 + 加粗标题，技能用顿号连接

function styleA(cats: Record<string, string[]>) {
  const items = nonEmpty(cats).map(([cat, skills]) => {
    const c = catColor(cat);
    return `<div class="skill-item" style="font-size:9.5pt;line-height:1.6;padding:0.15rem 0;border-bottom:1px dotted #e5e7eb"><span style="color:${c.accent};font-weight:700">▎${cat}</span><span style="color:#4b5563"> · ${skills.join("、")}</span></div>`;
  });
  return `<div class="skills-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:0 1.8rem">${items.join("")}</div>`;
}

// ── B 侧栏Pill — 现代标签风 ──
// 左列固定宽 pill + 右列技能描述，行间距宽松，pill 带左边框强调色

function styleB(cats: Record<string, string[]>) {
  const rows = nonEmpty(cats).map(([cat, skills]) => {
    const c = catColor(cat);
    return `<div class="skill-row" style="display:flex;align-items:flex-start;gap:0.6rem;margin-bottom:0.55rem"><span class="skill-pill" style="flex-shrink:0;background:${c.bg};color:${c.text};border-left:3px solid ${c.accent};border-radius:2px 6px 6px 2px;padding:0.15rem 0.6rem;font-size:9pt;font-weight:700;letter-spacing:0.02em">${cat}</span><span class="skill-desc" style="font-size:10pt;line-height:1.65;color:#555;padding-top:0.05rem">${skills.join(" · ")}</span></div>`;
  });
  return `<div class="skills-section">${rows.join("")}</div>`;
}

// ── D 标签云 — 干净云朵风 ──
// 全部技能打散为独立标签，统一圆角 pill，首技能加粗，按分类着色

function styleD(cats: Record<string, string[]>) {
  const tags: string[] = [];
  for (const [cat, skills] of nonEmpty(cats)) {
    const c = catColor(cat);
    skills.forEach((skill, i) => {
      const isFirst = i === 0;
      tags.push(`<span class="tag" style="padding:0.15rem 0.65rem;border-radius:14px;font-size:9.5pt;font-weight:${isFirst ? "700" : "500"};background:${c.bg};color:${c.text}">${skill}</span>`);
    });
  }
  return `<div class="tag-cloud" style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;line-height:1.6">${tags.join("")}</div>`;
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
