import type { TextBlock } from "@/components/preview/ClickablePdfView";
import { rgbToHex, mapPdfFontToCss } from "@/lib/editor/html-parser";

// ── pdfjs-dist TextItem 的原始字段 ──
interface RawTextItem {
  str?: string;
  transform?: number[];
  height?: number;
  width?: number;
  fontName?: string;
  color?: number[]; // pdfjs-dist 5.x: [r, g, b] (0-1)
}

export interface RichTextItem {
  text: string;
  fontSize: number;
  fontName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string; // hex color
}

export interface RichTextBlock extends TextBlock {
  fontSize: number;
  fontName: string;
  color: string; // hex color
  cssFontFamily: string; // mapped CSS font-family
  items: RichTextItem[];
}

/**
 * 从 PDF 提取所有文字块，附带字号、字体、颜色信息。
 * 按 Y 坐标分组为行，每行一个 block。
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

    // 收集每个文字项
    interface LineAcc {
      minX: number;
      pdfY: number;
      maxH: number;
      maxW: number;
      items: RichTextItem[];
    }

    const lineMap = new Map<number, LineAcc>();

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

      const richItem: RichTextItem = {
        text: str,
        fontSize,
        fontName,
        x,
        y: pdfY,
        width: charW,
        height: charH,
        color,
      };

      if (!lineMap.has(yKey)) {
        lineMap.set(yKey, {
          minX: x,
          pdfY,
          maxH: charH,
          maxW: x + charW,
          items: [],
        });
      }
      const line = lineMap.get(yKey)!;
      line.minX = Math.min(line.minX, x);
      line.maxH = Math.max(line.maxH, charH);
      line.maxW = Math.max(line.maxW, x + charW);
      line.items.push(richItem);
    }

    // 按 PDF y 降序（从上到下）
    const sorted = [...lineMap.entries()].sort((a, b) => b[0] - a[0]);

    for (const [, line] of sorted) {
      const text = line.items.map((it) => it.text).join(" ");
      // 取字号的中位数作为该行字号
      const fontSizes = line.items.map((it) => it.fontSize).sort((a, b) => a - b);
      const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)];
      const primaryFont = line.items[0]?.fontName ?? "";
      // 取第一个 item 的颜色作为该行颜色
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

/**
 * 将富文本块序列化为 AI 友好的 JSON，附带字号提示。
 * 大字号（≥18px）标为 heading，供 AI 识别分区标题。
 */
export function blocksToAiJson(blocks: RichTextBlock[]): string {
  const pages: Record<
    number,
    { text: string; fontSize: number; color: string }[]
  > = {};

  for (const b of blocks) {
    (pages[b.page] ??= []).push({
      text: b.text,
      fontSize: b.fontSize,
      color: b.color,
    });
  }

  return JSON.stringify(pages, null, 2);
}

/**
 * 将富文本块转为适合 AI 解析的格式化文本。
 * 字号 ≥18 的行前加 # 标记帮助 AI 识别标题。
 */
export function blocksToAiText(blocks: RichTextBlock[]): string {
  const pageTexts: string[] = [];

  const byPage = new Map<number, RichTextBlock[]>();
  for (const b of blocks) {
    const list = byPage.get(b.page) ?? [];
    list.push(b);
    byPage.set(b.page, list);
  }

  for (const pageBlocks of [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])) {
    const lines: string[] = [];
    for (const b of pageBlocks) {
      const prefix = b.fontSize >= 18 ? "# " : "";
      lines.push(prefix + b.text);
    }
    pageTexts.push(lines.join("\n"));
  }

  return pageTexts.join("\n\n");
}
