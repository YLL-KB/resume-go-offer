/**
 * PDF 导出：pdfjs-dist 坐标 + PDF 背景 → Canvas 逐块覆盖 → PNG → jsPDF。
 * 布局 100% 保留，文字原位替换。
 */
import type { RichTextBlock } from "@/lib/pdf/text-extractor";

const SCALE = 2;
const FONT = "'PingFang SC','Heiti SC','STHeitiSC-Medium','Noto Sans SC','Microsoft YaHei',sans-serif";

export async function renderAllPages(
  markdown: string,
  pdfUrl?: string,
  _contentList?: unknown,
  editedBlocks?: Map<number, string>, // globalIndex → new text
  _mods?: unknown[],
  _edits?: Record<string, string>,
  _del?: Set<string>,
  _imgs?: Record<string, unknown>,
  _delImgs?: Set<string>,
  onProgress?: (c: number, t: number) => void,
): Promise<string[]> {
  if (!pdfUrl || !editedBlocks?.size) {
    // 降级：纯 Markdown 渲染
    return fallbackMarkdown(markdown, onProgress);
  }

  // 1. 提取原 PDF 的 text blocks（带坐标）
  const { extractTextBlocks } = await import("@/lib/pdf/text-extractor");
  const blocks = await extractTextBlocks(pdfUrl);

  // 2. 按页分组 + 渲染背景
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
  const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;

  const pageMap = new Map<number, RichTextBlock[]>();
  for (const b of blocks) { const l = pageMap.get(b.page) ?? []; l.push(b); pageMap.set(b.page, l); }

  const result: string[] = [];
  for (const [pn, pageBlocks] of pageMap) {
    onProgress?.(pn, pageMap.size);

    // 渲染 PDF 页为背景 Canvas
    const page = await pdf.getPage(pn);
    const vp = page.getViewport({ scale: SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvas, viewport: vp }).promise;
    const ctx = canvas.getContext("2d")!;

    // 逐块覆盖文字
    for (const block of pageBlocks) {
      const newText = editedBlocks.get(block.globalIndex);
      const text = newText ?? block.text;
      const fontSize = block.fontSize * SCALE;
      const fontFamily = block.cssFontFamily || FONT;
      const color = block.color || "#000000";

      // PDF y(bottom-left) → Canvas y(top-left)
      const cx = block.x * SCALE;
      const cw = block.width * SCALE;
      const ch = block.height * SCALE;
      const cy = (block.pageHeight - block.y - block.height) * SCALE;

      // 白色矩形覆盖
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - 2, cy - 2, cw + 4, ch + 4);

      // 画新文字
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.textBaseline = "top";

      const maxW = cw - 4;
      const lh = fontSize * 1.5;
      const words = text.split(/(?<=[一-鿿])|(?=[一-鿿])|\s+/);
      let line = "", ly = cy + 2;
      for (const w of words) {
        if (!w) continue;
        const t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, cx + 2, ly); line = w; ly += lh; }
        else line = t;
      }
      if (line) ctx.fillText(line, cx + 2, ly);
    }
    result.push(canvas.toDataURL("image/png"));
  }
  return result;
}

async function fallbackMarkdown(markdown: string, onProgress?: (c: number, t: number) => void): Promise<string[]> {
  onProgress?.(1, 1);
  const clean = markdown.replace(/!\[.*?\]\(.*?\)/g, "").replace(/<!--\s*image\s*-->/g, "");
  const { marked } = await import("marked");
  const html = await marked.parse(clean);
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:0;top:0;width:210mm;z-index:99999;background:#fff;font-family:'PingFang SC','Heiti SC','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;padding:20mm 25mm";
  container.innerHTML = html;
  document.body.appendChild(container);
  await new Promise(r => setTimeout(r, 300));
  const imgs = container.querySelectorAll("img");
  await Promise.all([...imgs].map(i => new Promise<void>(r => { if (i.complete) r(); else { i.onload = () => r(); i.onerror = () => r(); } })));
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(container, { pixelRatio: 2, backgroundColor: "#ffffff" });
  document.body.removeChild(container);
  return [dataUrl];
}

export async function downloadPdf(dataUrls: string[], filename = "resume.pdf") {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  for (let i = 0; i < dataUrls.length; i++) {
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrls[i], "PNG", 0, 0, 210, 297, undefined, "FAST");
  }
  pdf.save(filename);
}
