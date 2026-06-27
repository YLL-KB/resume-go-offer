import type { TextBlock } from "@/components/preview/ClickablePdfView";

export interface Module {
  id: string;
  label: string;
  page: number;
  blocks: TextBlock[];
}

/**
 * 按 Y 坐标间距将文字块分组为模块。
 * 同一页内，Y 间距超过 gapThreshold 则切分新模块。
 */
export function detectModules(
  blocks: TextBlock[],
  gapThreshold = 20,
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
      if (current.length === 0) {
        current.push(block);
        continue;
      }
      const prev = current[current.length - 1];
      // 前一个 block 的底部 到 当前 block 的顶部的间距
      const prevBottom = prev.y - prev.height;
      const gap = prevBottom - block.y;
      if (gap > gapThreshold) {
        groups.push(current);
        current = [block];
      } else {
        current.push(block);
      }
    }
    if (current.length > 0) groups.push(current);

    for (let gi = 0; gi < groups.length; gi++) {
      const groupBlocks = groups[gi];
      // 取第一个 block 的文字作为标签
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
