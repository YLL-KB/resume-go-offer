/**
 * 全页 Canvas 渲染 → PNG → PDF 导出管线。
 *
 * 1. 将模版 PDF 每一页渲染到 Canvas（背景层）
 * 2. 在同一 Canvas 上用覆盖矩形 + 新文字/图片替换原内容
 * 3. 导出 Canvas 为 PNG
 * 4. 用 jsPDF 合并多页
 */

import type { TextBlock } from "@/components/preview/ClickablePdfView";
import type { Module } from "@/lib/pdf/module-detector";
import type { ImageBlock } from "@/lib/pdf/image-extractor";
import { parseModuleHtml } from "@/lib/editor/html-parser";
import type { BlockTextData } from "@/lib/editor/html-parser";

// ── 导出分辨率倍率 ──
const EXPORT_SCALE = 2;

// CJK 字体栈（与浏览器编辑器一致）
const FONT_FAMILY = [
  "'PingFang SC'",
  "'Heiti SC'",
  "'STHeitiSC-Medium'",
  "'Noto Sans SC'",
  "'Microsoft YaHei'",
  "sans-serif",
].join(", ");

// ── 将模版 PDF 某一页渲染到 Canvas ──
async function renderPageToCanvas(
  pdfUrl: string,
  pageNum: number,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; viewportHeight: number }> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvas, viewport }).promise;

  return { canvas, viewportHeight: viewport.height };
}

// ── 在 Canvas 上绘制文本块 ──
function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  data: BlockTextData,
  pageHeight: number,
  scale: number,
): void {
  const blockWidth = data.width ?? block.width;
  const blockHeight = data.height ?? block.height;

  const x = block.x * scale;
  const w = blockWidth * scale;
  const h = blockHeight * scale;
  const fontSize = (data.fontSize ?? 11) * scale;
  const fontFamily = data.fontFamily || FONT_FAMILY;
  const textColor = data.color ?? "#000000";

  // PDF y 是 bottom-left baseline，Canvas y 是 top-left
  const coverTop = (pageHeight - block.y) * scale;
  const coverY = coverTop - h * 0.3;

  // 白色背景覆盖原文
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 2 * scale, coverY - 2 * scale, w + 4 * scale, h + 4 * scale);

  // 绘制新文字
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";

  const indentPx = data.textIndent ? fontSize * 2 : 0;
  const maxWidth = w - 4 * scale - indentPx;
  const lineHeight = fontSize * 1.5;

  // CJK 感知的自动换行
  const words = data.text.split(/(?<=[一-鿿])|(?=[一-鿿])|\s+/);
  let line = "";
  let y = coverY + 2 * scale;
  let firstLine = true;

  for (const word of words) {
    if (!word) continue;
    const testLine = line ? line + " " + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x + (firstLine ? indentPx : 0), y);
      line = word;
      y += lineHeight;
      firstLine = false;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x + (firstLine ? indentPx : 0), y);
  }
}

// ── 在 Canvas 上绘制未编辑的文本块 ──
function drawOriginalTextBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  pageHeight: number,
  scale: number,
): void {
  const richBlock = block as TextBlock & {
    fontSize?: number;
    color?: string;
    cssFontFamily?: string;
  };

  const x = block.x * scale;
  const w = block.width * scale;
  const h = block.height * scale;
  const coverTop = (pageHeight - block.y) * scale;
  const coverY = coverTop - h * 0.3;

  const fontSize = (richBlock.fontSize ?? 11) * scale;
  const fontFamily = richBlock.cssFontFamily || FONT_FAMILY;
  const textColor = richBlock.color ?? "#000000";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 2 * scale, coverY - 2 * scale, w + 4 * scale, h + 4 * scale);

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";

  const maxWidth = w - 4 * scale;
  const lineHeight = fontSize * 1.5;

  const words = block.text.split(/(?<=[一-鿿])|(?=[一-鿿])|\s+/);
  let line = "";
  let y = coverY + 2 * scale;

  for (const word of words) {
    if (!word) continue;
    const testLine = line ? line + " " + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
  }
}

// ── 在 Canvas 上绘制图片 ──
async function drawImageBlock(
  ctx: CanvasRenderingContext2D,
  imageBlock: ImageBlock,
  scale: number,
): Promise<void> {
  const img = await loadImage(imageBlock.dataUrl);
  ctx.drawImage(
    img,
    imageBlock.x * scale,
    imageBlock.y * scale,
    imageBlock.width * scale,
    imageBlock.height * scale,
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── 主编排函数：收集编辑数据，逐页渲染 Canvas → 导出 PNG Data URL ──
export async function renderAllPages(
  pdfUrl: string,
  templateBlocks: TextBlock[],
  templateModules: Module[],
  editedModules: Record<string, string>,
  deletedModules: Set<string>,
  editedImages: Record<string, ImageBlock>,
  deletedImages: Set<string>,
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  // 1. 收集所有编辑后的 text data: globalIndex → BlockTextData
  const editedTextMap = new Map<number, BlockTextData>();

  for (const mod of templateModules) {
    if (deletedModules.has(mod.id)) continue; // 跳过已删除模块
    const html = editedModules[mod.id];
    if (!html) continue;
    const blockData = parseModuleHtml(html, mod.blocks.length);
    for (let i = 0; i < mod.blocks.length; i++) {
      const block = mod.blocks[i];
      const data = blockData[i];
      if (data) {
        editedTextMap.set(block.globalIndex, data);
      }
    }
  }

  // 2. 收集属于已删除模块的 block globalIndex 集合
  const deletedBlockIndices = new Set<number>();
  for (const mod of templateModules) {
    if (deletedModules.has(mod.id)) {
      for (const block of mod.blocks) {
        deletedBlockIndices.add(block.globalIndex);
      }
    }
  }

  // 3. 按页码分组
  const pageMap = new Map<number, TextBlock[]>();
  for (const block of templateBlocks) {
    const list = pageMap.get(block.page) ?? [];
    list.push(block);
    pageMap.set(block.page, list);
  }

  // 4. 按页码分组图片
  const pageImages = new Map<number, ImageBlock[]>();
  for (const img of Object.values(editedImages)) {
    const list = pageImages.get(img.page) ?? [];
    list.push(img);
    pageImages.set(img.page, list);
  }

  const pageNums = [...pageMap.keys()].sort((a, b) => a - b);
  const result: string[] = [];

  for (let i = 0; i < pageNums.length; i++) {
    const pageNum = pageNums[i];
    const blocks = pageMap.get(pageNum)!;
    onProgress?.(i + 1, pageNums.length);

    // 渲染模版页背景到 Canvas
    const { canvas, viewportHeight } = await renderPageToCanvas(
      pdfUrl,
      pageNum,
      EXPORT_SCALE,
    );

    const ctx = canvas.getContext("2d")!;

    // 渲染图片（先画图片，再画文字覆盖层）
    const images = pageImages.get(pageNum) ?? [];
    for (const img of images) {
      if (deletedImages.has(img.id)) continue; // 跳过已删除的图片
      await drawImageBlock(ctx, img, EXPORT_SCALE);
    }

    // 在背景上覆盖文字
    for (const block of blocks) {
      // 已删除模块的块：画白色矩形完全覆盖原内容
      if (deletedBlockIndices.has(block.globalIndex)) {
        const sx = block.x * EXPORT_SCALE;
        const sy = (viewportHeight / EXPORT_SCALE - block.y - block.height) * EXPORT_SCALE;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(
          sx - 4,
          sy - 4,
          block.width * EXPORT_SCALE + 8,
          block.height * EXPORT_SCALE + 8,
        );
        continue;
      }

      const data = editedTextMap.get(block.globalIndex);
      if (data && data.text) {
        drawTextBlock(ctx, block, data, viewportHeight / EXPORT_SCALE, EXPORT_SCALE);
      } else {
        drawOriginalTextBlock(ctx, block, viewportHeight / EXPORT_SCALE, EXPORT_SCALE);
      }
    }

    result.push(canvas.toDataURL("image/png"));
  }

  return result;
}

// ── 将多页 PNG Data URL 合并为 PDF 并触发下载 ──
export async function downloadPdf(
  pageDataUrls: string[],
  filename = "resume.pdf",
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;

  for (let i = 0; i < pageDataUrls.length; i++) {
    if (i > 0) pdf.addPage();
    pdf.addImage(
      pageDataUrls[i],
      "PNG",
      0,
      0,
      pageWidth,
      pageHeight,
      undefined,
      "FAST",
    );
  }

  pdf.save(filename);
}
