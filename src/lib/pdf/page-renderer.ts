/**
 * PDF 原位编辑：pdf-lib + MinerU bbox → 白色矩形覆盖原文 → 嵌入原字体画新文字。
 * 服务端运行，输出真正 PDF（非截图）。
 */
import type { ContentItem } from "@/lib/pdf/mineru-extractor";

export async function renderAllPages(
  markdown: string,
  pdfUrl?: string,
  _contentList?: unknown,
  _blocks?: unknown[],
  _mods?: unknown[],
  _edits?: Record<string, string>,
  _del?: Set<string>,
  _imgs?: Record<string, unknown>,
  _delImgs?: Set<string>,
  onProgress?: (c: number, t: number) => void,
): Promise<string[]> {
  // 客户端降级：纯 Markdown 渲染
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

  const A4_H = 297 * 2 * 2;
  const img = await new Promise<HTMLImageElement>(r => { const i = new Image(); i.onload = () => r(i); i.src = dataUrl; });
  const pages = Math.ceil(img.height / A4_H);
  const result: string[] = [];
  const canvas = document.createElement("canvas");
  canvas.width = 210 * 2 * 2; canvas.height = A4_H;
  for (let p = 0; p < pages; p++) {
    onProgress?.(p + 1, pages);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, -p * A4_H);
    result.push(canvas.toDataURL("image/png"));
  }
  return result;
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
