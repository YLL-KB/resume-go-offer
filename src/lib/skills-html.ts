/**
 * 技能区块 HTML 生成（纯模板，无需 AI）
 *
 * 当前使用侧栏 Pill 风格：左列 pill 标签 + 右列技能列表
 */

import { getCatColor, type CatColor } from "@/lib/theme-utils";

export function renderSkillsHtml(
  categorizedSkills: Record<string, string[]>,
  catColors: Record<string, CatColor>,
  textMuted = "#555",
): string {
  const rows = Object.entries(categorizedSkills)
    .filter(([, skills]) => skills.length > 0)
    .map(([cat, skills]) => {
      const c = getCatColor(cat, catColors);
      return `<div class="skill-row" style="display:flex;align-items:flex-start;gap:0.6rem;margin-bottom:0.55rem"><span class="skill-pill" style="flex-shrink:0;background:${c.bg};color:${c.text};border-left:3px solid ${c.accent};border-radius:2px 6px 6px 2px;padding:0.15rem 0.6rem;font-size:9pt;font-weight:700;letter-spacing:0.02em">${cat}</span><span class="skill-desc" style="font-size:10pt;line-height:1.65;color:${textMuted};padding-top:0.05rem">${skills.join(" · ")}</span></div>`;
    });
  return `<div class="skills-section">${rows.join("")}</div>`;
}
