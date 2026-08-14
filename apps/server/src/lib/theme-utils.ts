/**
 * 主题相关的共享工具（客户端 & 服务端均可使用）。
 * 注意：此文件不可 import React / "use client" 模块，保持纯 TypeScript。
 */

export type ResumeTheme = "ocean" | "forest" | "slate" | "warm";

export interface CatColor {
  bg: string;
  text: string;
  accent: string;
}

export interface ThemeConfig {
  name: string;
  primary: string;
  primaryLight: string;
  primaryBg: string;
  secondary: string;
  pageBg: string;
  textMain: string;
  textMuted: string;
  border: string;
  catColors: Record<string, CatColor>;
}

export const THEMES: Record<ResumeTheme, ThemeConfig> = {
  ocean: {
    name: "海蓝经典",
    primary: "#2563eb",
    primaryLight: "#2563eb",
    primaryBg: "#fafafa",
    secondary: "#0ea5e9",
    pageBg: "#ffffff",
    textMain: "#333333",
    textMuted: "#6b7280",
    border: "#2563eb",
    catColors: {
      "AI / LLM":       { bg: "#eff6ff", text: "#1e40af", accent: "#3b82f6" },
      "前端基础":       { bg: "#fef2f2", text: "#991b1b", accent: "#ef4444" },
      "UI 生态":        { bg: "#f0fdf4", text: "#166534", accent: "#22c55e" },
      "工程化":         { bg: "#fefce8", text: "#854d0e", accent: "#eab308" },
      "全栈 / 移动端":  { bg: "#f0f9ff", text: "#0369a1", accent: "#0ea5e9" },
    },
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
    catColors: {
      "AI / LLM":       { bg: "#ecfeff", text: "#155e75", accent: "#06b6d4" },
      "前端基础":       { bg: "#fef2f2", text: "#991b1b", accent: "#ef4444" },
      "UI 生态":        { bg: "#f0fdf4", text: "#166534", accent: "#22c55e" },
      "工程化":         { bg: "#fefce8", text: "#854d0e", accent: "#eab308" },
      "全栈 / 移动端":  { bg: "#f0fdf4", text: "#15803d", accent: "#059669" },
    },
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
    catColors: {
      "AI / LLM":       { bg: "#eef2ff", text: "#3730a3", accent: "#6366f1" },
      "前端基础":       { bg: "#fef2f2", text: "#991b1b", accent: "#ef4444" },
      "UI 生态":        { bg: "#f0fdf4", text: "#166534", accent: "#22c55e" },
      "工程化":         { bg: "#fefce8", text: "#854d0e", accent: "#eab308" },
      "全栈 / 移动端":  { bg: "#f1f5f9", text: "#334155", accent: "#64748b" },
    },
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
    catColors: {
      "AI / LLM":       { bg: "#fefce8", text: "#854d0e", accent: "#eab308" },
      "前端基础":       { bg: "#fef2f2", text: "#991b1b", accent: "#ef4444" },
      "UI 生态":        { bg: "#f0fdf4", text: "#166534", accent: "#22c55e" },
      "工程化":         { bg: "#fef3c7", text: "#92400e", accent: "#d97706" },
      "全栈 / 移动端":  { bg: "#fff7ed", text: "#9a3412", accent: "#f97316" },
    },
  },
};

export const DEFAULT_CAT_COLOR: CatColor = { bg: "#f3f4f6", text: "#374151", accent: "#6b7280" };

/** 预定义调色板 —— 未命中 catColors 时按 hash 选一个，保证同分类名颜色一致 */
const FALLBACK_PALETTE: CatColor[] = [
  { bg: "#eff6ff", text: "#1e40af", accent: "#3b82f6" }, // 蓝
  { bg: "#fef2f2", text: "#991b1b", accent: "#ef4444" }, // 红
  { bg: "#f0fdf4", text: "#166534", accent: "#22c55e" }, // 绿
  { bg: "#fefce8", text: "#854d0e", accent: "#eab308" }, // 琥珀
  { bg: "#faf5ff", text: "#6b21a8", accent: "#8b5cf6" }, // 紫
  { bg: "#ecfeff", text: "#155e75", accent: "#06b6d4" }, // 青
  { bg: "#fff7ed", text: "#9a3412", accent: "#f97316" }, // 橙
  { bg: "#fdf2f8", text: "#9d174d", accent: "#ec4899" }, // 粉
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getCatColor(
  cat: string,
  catColors?: Record<string, CatColor>,
): CatColor {
  // 精确匹配
  if (catColors?.[cat]) return catColors[cat];

  // 去除空格/标点后做宽松匹配
  const normalize = (s: string) => s.replace(/[\s/·、，]+/g, "").toLowerCase();
  const key = normalize(cat);
  if (catColors) {
    for (const [k, v] of Object.entries(catColors)) {
      if (normalize(k) === key) return v;
    }
  }

  // fallback：从调色板中按 hash 选一个
  return FALLBACK_PALETTE[hashString(cat) % FALLBACK_PALETTE.length];
}
