import type { TextBlock } from "@/components/preview/ClickablePdfView";

export interface Module {
  id: string;
  label: string;
  page: number;
  blocks: TextBlock[];
}

// ── 内容感知的模块检测 ──

/** 判断文本是否以序号开头 */
function isNumberedStart(text: string): boolean {
  // 数字序号：1. 1) 1、 ① ⑩ ⓫
  if (/^\s*\d+[\.\)、]\s*/.test(text)) return true;
  // 中文序号：一、 二、 三、
  if (/^\s*[一二三四五六七八九十]+[、，]\s*/.test(text)) return true;
  // 括号序号：(1) (一) （1） （一）
  if (/^\s*[\(（]\s*[\d一二三四五六七八九十]+\s*[\)）]\s*/.test(text)) return true;
  // 带圈数字：①②③④⑤⑥⑦⑧⑨⑩
  if (/^\s*[①-⑩⓫-⓴]\s*/.test(text)) return true;
  return false;
}

/** 文本是否以句末标点结尾 */
function endsWithSentenceEnd(text: string): boolean {
  return /[。！？.!?]$/.test(text.trim());
}

/** 文本是否以冒号结尾 */
function endsWithColon(text: string): boolean {
  return /[：:]$/.test(text.trim());
}

/** 文本是否以分号或顿号结尾 */
function endsWithMinorPause(text: string): boolean {
  return /[；、;]$/.test(text.trim());
}

/** 粗略判断文本主要是中文还是英文 */
function scriptType(text: string): "cjk" | "latin" | "mixed" {
  const cjkCount = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (cjkCount > latinCount * 2) return "cjk";
  if (latinCount > cjkCount * 2) return "latin";
  return "mixed";
}

/** 检测字体名是中文还是英文字体 */
function fontScript(fontName: string): "cjk" | "latin" | "unknown" {
  if (!fontName) return "unknown";
  const lower = fontName.toLowerCase();
  if (/sim|hei|kai|song|fang|ming|yuan|chinese|cjk|黑|宋|楷|仿|明|圆/.test(lower)) return "cjk";
  if (/times|helvetica|arial|roman|courier|gothic/.test(lower)) return "latin";
  return "unknown";
}

/** Y 间距（大间距 > 18px，中等 > 10px，紧密 ≤ 6px） */
function calcGap(prev: TextBlock, curr: TextBlock): number {
  return (prev.y - prev.height) - curr.y;
}

/**
 * 智能模块检测。
 *
 * 切分规则（按优先级）：
 * 1. 字号突变（≥30%）→ 新模块
 * 2. 字体族跨中英切换 → 新模块
 * 3. 内容以序号开头 → 新模块
 * 4. 前一块以句号结尾 + 间距 > 10px → 新模块（自然段结束）
 * 5. 前一块以冒号结尾 → 新模块（新节开始）
 * 6. 前一块以分号/顿号结尾 + 间距 > 14px → 新模块
 * 7. 中英文内容切换（cjk↔latin）+ 间距 > 6px → 新模块
 * 8. 纯间距 > 18px → 新模块
 */
export function detectModules(blocks: TextBlock[]): Module[] {
  const byPage = new Map<number, TextBlock[]>();
  for (const b of blocks) {
    const list = byPage.get(b.page) ?? [];
    list.push(b);
    byPage.set(b.page, list);
  }

  const modules: Module[] = [];

  for (const [page, pageBlocks] of byPage) {
    const sorted = [...pageBlocks].sort((a, b) => b.y - a.y);
    const groups: TextBlock[][] = [];
    let current: TextBlock[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i];
      const blockText = block.text.trim();

      if (current.length === 0) {
        current.push(block);
        continue;
      }

      const prev = current[current.length - 1];
      const prevText = prev.text.trim();
      const gap = calcGap(prev, block);

      // 字号
      const blockFs = (block as TextBlock & { fontSize?: number }).fontSize ?? 11;
      const prevFs = (prev as TextBlock & { fontSize?: number }).fontSize ?? 11;
      // 字体
      const blockFn = (block as TextBlock & { fontName?: string }).fontName ?? "";
      const prevFn = (prev as TextBlock & { fontName?: string }).fontName ?? "";

      // ── 切分判断 ──
      let shouldSplit = false;

      // 1. 字号突变
      if (blockFs > prevFs * 1.3 && blockFs >= 14) shouldSplit = true;

      // 2. 中英文字体切换
      const prevFs2 = fontScript(prevFn);
      const blockFs2 = fontScript(blockFn);
      if (
        prevFs2 !== "unknown" && blockFs2 !== "unknown" &&
        prevFs2 !== blockFs2
      ) {
        shouldSplit = true;
      }

      // 3. 序号开头
      if (isNumberedStart(blockText)) shouldSplit = true;

      // 4. 句号结尾 + 大间距
      if (endsWithSentenceEnd(prevText) && gap > 10) shouldSplit = true;

      // 5. 冒号结尾 → 开新节
      if (endsWithColon(prevText)) shouldSplit = true;

      // 6. 分号/顿号结尾 + 间距较大
      if (endsWithMinorPause(prevText) && gap > 14) shouldSplit = true;

      // 7. 内容脚本切换 + 有间距
      const prevScr = scriptType(prevText);
      const blockScr = scriptType(blockText);
      if (
        prevScr !== "mixed" && blockScr !== "mixed" &&
        prevScr !== blockScr && gap > 6
      ) {
        shouldSplit = true;
      }

      // 8. 纯间距
      if (gap > 18) shouldSplit = true;

      // ── 执行切分 ──
      if (shouldSplit) {
        groups.push(current);
        current = [block];
      } else {
        current.push(block);
      }
    }

    if (current.length > 0) groups.push(current);

    for (let gi = 0; gi < groups.length; gi++) {
      const groupBlocks = groups[gi];
      const firstText = groupBlocks[0]?.text ?? "";
      const label = firstText.length > 20 ? firstText.slice(0, 20) + "…" : firstText;
      modules.push({
        id: `module-${page}-${gi}`,
        label: label || `模块 ${gi + 1}`,
        page,
        blocks: groupBlocks,
      });
    }
  }

  return modules;
}

/** 根据 block 的 globalIndex 查找所属模块 */
export function getModuleByBlockIndex(
  modules: Module[],
  globalIndex: number,
): Module | null {
  for (const m of modules) {
    if (m.blocks.some((b) => b.globalIndex === globalIndex)) return m;
  }
  return null;
}

/** 获取模块内所有 block 的 globalIndex 集合 */
export function getModuleBlockIndices(module: Module | null): Set<number> {
  if (!module) return new Set();
  return new Set(module.blocks.map((b) => b.globalIndex));
}
