import type { TextBlock } from "@/components/preview/ClickablePdfView";
import { rgbToHex, mapPdfFontToCss } from "@/lib/editor/html-parser";

// ── pdfjs-dist TextItem 的原始字段 ──
interface RawTextItem {
  str?: string;
  transform?: number[];
  height?: number;
  width?: number;
  fontName?: string;
  color?: number[];
}

export interface RichTextItem {
  text: string;
  fontSize: number;
  fontName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface RichTextBlock extends TextBlock {
  fontSize: number;
  fontName: string;
  color: string;
  cssFontFamily: string;
  items: RichTextItem[];
}

/** 判断字体脚本类型：cjk / latin / unknown */
function fontScript(fontName: string): "cjk" | "latin" | "unknown" {
  if (!fontName) return "unknown";
  const lower = fontName.toLowerCase();
  if (/sim|hei|kai|song|fang|ming|yuan|chinese|cjk|黑|宋|楷|仿|明|圆|noto.*sc|pingfang/.test(lower)) return "cjk";
  if (/times|helvetica|arial|roman|courier|gothic|calibri|lato|roboto/.test(lower)) return "latin";
  return "unknown";
}

/**
 * 从 PDF 提取所有文字块，附带字号、字体、颜色信息。
 *
 * 同行但不同字体的文字项 → 拆成独立 block。
 * 这样「个人简历」(黑体) 和「Personal resume」(Times) 即使在同一行也不会被合并。
 */
export async function extractTextBlocks(url: string): Promise<RichTextBlock[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const blocks: RichTextBlock[] = [];
  let globalIndex = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    interface LineAcc {
      minX: number;
      pdfY: number;
      maxH: number;
      maxW: number;
      items: RichTextItem[];
    }

    // key: `${roundedY}|${fontScript}|${fontName}` — 同行不同字体的不会合并
    const lineMap = new Map<string, LineAcc>();

    for (const item of content.items) {
      const it = item as RawTextItem;
      const str = it.str?.trim() ?? "";
      if (!str) continue;

      const tx = it.transform ?? [0, 0, 0, 0, 0, 0];
      const x = tx[4];
      const pdfY = tx[5];
      const charH = it.height ?? 10;
      const charW = it.width ?? str.length * charH * 0.55;
      const fontSize = Math.abs(tx[3]) || charH;
      const fontName = it.fontName ?? "";
      const color = rgbToHex(it.color ?? [0, 0, 0]);

      const yKey = Math.round(pdfY);
      const fs = fontScript(fontName);
      // 同行+同字体 → 合并；同行+不同字体 → 分开
      const groupKey = `${yKey}|${fs}|${fontName}`;

      const richItem: RichTextItem = { text: str, fontSize, fontName, x, y: pdfY, width: charW, height: charH, color };

      if (!lineMap.has(groupKey)) {
        lineMap.set(groupKey, { minX: x, pdfY, maxH: charH, maxW: x + charW, items: [] });
      }
      const line = lineMap.get(groupKey)!;
      line.minX = Math.min(line.minX, x);
      line.maxH = Math.max(line.maxH, charH);
      line.maxW = Math.max(line.maxW, x + charW);
      line.items.push(richItem);
    }

    // 按 PDF y 降序（从上到下），同 y 按 x 升序（从左到右）
    const sorted = [...lineMap.entries()].sort((a, b) => {
      const ya = a[1].pdfY;
      const yb = b[1].pdfY;
      if (Math.abs(ya - yb) > 1) return yb - ya; // 降序：大的先（即物理上方的先）
      return a[1].minX - b[1].minX; // 同高从左到右
    });

    for (const [, line] of sorted) {
      const text = line.items.map((it) => it.text).join(" ");
      const fontSizes = line.items.map((it) => it.fontSize).sort((a, b) => a - b);
      const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)];
      const primaryFont = line.items[0]?.fontName ?? "";
      const lineColor = line.items[0]?.color ?? "#000000";

      blocks.push({
        x: line.minX,
        y: line.pdfY,
        width: line.maxW - line.minX + 16,
        height: line.maxH + 6,
        text,
        page: p,
        globalIndex: globalIndex++,
        pageHeight: viewport.height,
        fontSize: Math.round(medianFontSize * 10) / 10,
        fontName: primaryFont,
        color: lineColor,
        cssFontFamily: mapPdfFontToCss(primaryFont),
        items: line.items,
      });
    }
  }

  return blocks;
}

export function blocksToAiJson(blocks: RichTextBlock[]): string {
  const pages: Record<number, { text: string; fontSize: number; color: string }[]> = {};
  for (const b of blocks) {
    (pages[b.page] ??= []).push({ text: b.text, fontSize: b.fontSize, color: b.color });
  }
  return JSON.stringify(pages, null, 2);
}

export function blocksToAiText(blocks: RichTextBlock[]): string {
  const pageTexts: string[] = [];
  const byPage = new Map<number, RichTextBlock[]>();
  for (const b of blocks) {
    const list = byPage.get(b.page) ?? [];
    list.push(b);
    byPage.set(b.page, list);
  }
  for (const pageBlocks of [...byPage.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) {
    const lines: string[] = [];
    for (const b of pageBlocks) {
      const prefix = b.fontSize >= 18 ? "# " : "";
      lines.push(prefix + b.text);
    }
    pageTexts.push(lines.join("\n"));
  }
  return pageTexts.join("\n\n");
}
