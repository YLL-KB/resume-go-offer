import { PDFDocument } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";

/**
 * 将每个文本块的 text 渲染为带白色背景的 PNG 图片，嵌入 PDF 覆盖旧文字。
 *
 * 客户端通过 ClickablePdfView 提取文本块坐标，用户编辑块内文本后，
 * 将更新后的 blocks 传入此函数，逐一渲染到 PDF。
 *
 * 所有文本统一通过 @napi-rs/canvas 渲染，确保文字样式正确且旧文字被精确覆盖。
 */

const CJK_FONT_FAMILY = '"Heiti SC", "STHeitiSC-Medium", "PingFang SC", sans-serif';

export interface PdfTextBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  page: number;
  globalIndex?: number;
  fontSize?: number;
  textIndent?: boolean;
}

export interface FillResult {
  pdfBytes: Uint8Array;
  pageCount: number;
}

// ── 将文本渲染为 PNG buffer ──
function renderTextToPng(
  text: string,
  width: number,
  height: number,
  fontSize: number,
  indent: boolean,
): Uint8Array {
  const scale = 2;
  const canvas = createCanvas(Math.max(width * scale, 100), Math.max(height * scale, 20));
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // 白色背景：精确覆盖旧文字
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.font = `${fontSize}px ${CJK_FONT_FAMILY}`;
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  const indentPx = indent ? fontSize * 2 : 0;
  const maxWidth = width - 4 - indentPx;
  const words = text.split(/(?<=[一-鿿])|(?=[一-鿿])|\s+/);
  let line = "";
  let y = 1;
  let firstLine = true;

  for (const word of words) {
    if (!word) continue;
    const testLine = line ? line + " " + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, 2 + (firstLine ? indentPx : 0), y);
      line = word;
      y += fontSize + 1;
      firstLine = false;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, 2 + (firstLine ? indentPx : 0), y);
  }

  return canvas.toBuffer("image/png");
}

// ── 主函数：逐块渲染 ──
export async function fillPdfTemplate(
  templateBytes: ArrayBuffer,
  blocks: PdfTextBlock[],
): Promise<FillResult> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();

  const errors: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.text?.trim()) continue;
    if (block.page < 1 || block.page > pages.length) {
      errors.push(`block[${i}]: page ${block.page} 超出范围 (总页数: ${pages.length})`);
      continue;
    }

    try {
      const page = pages[block.page - 1];
      const fontSize = block.fontSize ?? Math.min(block.height - 2, 11);

      const pngBytes = renderTextToPng(
        block.text,
        block.width,
        block.height,
        fontSize,
        block.textIndent ?? false,
      );
      const image = await pdfDoc.embedPng(pngBytes);
      page.drawImage(image, {
        x: block.x,
        y: block.y - block.height + fontSize,
        width: block.width,
        height: block.height,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`block[${i}] page=${block.page} text="${block.text.slice(0, 40)}": ${msg}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`PDF 填充错误 (${errors.length}/${blocks.length}):\n${errors.slice(0, 10).join("\n")}`);
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, pageCount: pages.length };
}
