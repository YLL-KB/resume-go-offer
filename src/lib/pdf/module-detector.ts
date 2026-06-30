import type { TextBlock } from "@/components/preview/ClickablePdfView";

export interface Module {
  id: string;
  label: string;
  page: number;
  blocks: TextBlock[];
}

/**
 * 智能模块检测：按 Y 间距 + 字号变化切分。
 *
 * 触发新模块的条件（满足任一即切分）：
 * 1. Y 间距 > gapThreshold（默认 12px）
 * 2. 当前块的 fontSize 比前一块大 30% 以上（可能是章节标题）
 * 3. 当前块字号 ≥ headingThreshold（默认 15px）且前一块更小 → 新章节开始
 */
export function detectModules(
  blocks: TextBlock[],
  gapThreshold = 10,
  headingThreshold = 14,
): Module[] {
  const byPage = new Map<number, TextBlock[]>();
  for (const b of blocks) {
    const list = byPage.get(b.page) ?? [];
    list.push(b);
    byPage.set(b.page, list);
  }

  const modules: Module[] = [];

  for (const [page, pageBlocks] of byPage) {
    // PDF y 坐标降序（从上到下）
    const sorted = [...pageBlocks].sort((a, b) => b.y - a.y);
    const groups: TextBlock[][] = [];
    let current: TextBlock[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i];
      // 获取字号信息
      const blockFontSize =
        (block as TextBlock & { fontSize?: number }).fontSize ?? 11;

      if (current.length === 0) {
        current.push(block);
        continue;
      }

      const prev = current[current.length - 1];
      const prevFontSize =
        (prev as TextBlock & { fontSize?: number }).fontSize ?? 11;

      // 前一个 block 的底部 到 当前 block 的顶部的间距
      const prevBottom = prev.y - prev.height;
      const gap = prevBottom - block.y;

      // 判断是否应该切分
      const largeGap = gap > gapThreshold;
      const fontSizeJump =
        blockFontSize > prevFontSize * 1.3 &&
        blockFontSize >= headingThreshold;
      const isHeading =
        blockFontSize >= headingThreshold &&
        prevFontSize < headingThreshold;

      if (largeGap || fontSizeJump || isHeading) {
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
      const label =
        firstText.length > 20 ? firstText.slice(0, 20) + "…" : firstText;
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
