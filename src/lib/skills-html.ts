/**
 * 技能区块 HTML 生成（纯模板，无需 AI）
 *
 * 当前使用侧栏 Pill 风格：左列 pill 标签 + 右列技能列表
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

export function renderSkillsHtml(
  categorizedSkills: Record<string, string[]>,
): string {
  const rows = nonEmpty(categorizedSkills).map(([cat, skills]) => {
    const c = catColor(cat);
    return `<div class="skill-row" style="display:flex;align-items:flex-start;gap:0.6rem;margin-bottom:0.55rem"><span class="skill-pill" style="flex-shrink:0;background:${c.bg};color:${c.text};border-left:3px solid ${c.accent};border-radius:2px 6px 6px 2px;padding:0.15rem 0.6rem;font-size:9pt;font-weight:700;letter-spacing:0.02em">${cat}</span><span class="skill-desc" style="font-size:10pt;line-height:1.65;color:#555;padding-top:0.05rem">${skills.join(" · ")}</span></div>`;
  });
  return `<div class="skills-section">${rows.join("")}</div>`;
}
