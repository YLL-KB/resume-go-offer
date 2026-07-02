/**
 * Markdown → A4 HTML → PNG → jsPDF。
 * 简洁稳定，不依赖 PDF 背景叠加。
 */
export async function renderAllPages(
  markdown: string,
  _pdfUrl?: string,
  _contentList?: unknown,
  _blocks?: unknown[],
  _mods?: unknown[],
  _edits?: Record<string, string>,
  _del?: Set<string>,
  _imgs?: Record<string, unknown>,
  _delImgs?: Set<string>,
  onProgress?: (c: number, t: number) => void,
): Promise<string[]> {
  onProgress?.(1, 1);
  if (!markdown?.trim()) return [];

  const clean = markdown.replace(/!\[.*?\]\(.*?\)/g, "").replace(/<!--\s*image\s*-->/g, "");
  const { marked } = await import("marked");
  const html = await marked.parse(clean);

  const pageHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:210mm;background:#fff;font-family:'PingFang SC','Heiti SC','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;padding:20mm 25mm}
h1{font-size:24px;margin:0 0 12px;text-align:center}
h2{font-size:18px;margin:24px 0 8px;border-bottom:1.5px solid #333;padding-bottom:4px}
h3{font-size:15px;margin:16px 0 6px}
p{margin:4px 0}
ul,ol{margin:4px 0 4px 20px}
li{margin:2px 0}
table{border-collapse:collapse;width:100%;margin:8px 0}
td,th{border:1px solid #ddd;padding:4px 8px}
img{max-width:100px}
hr{border:none;border-top:1px solid #ccc;margin:12px 0}
</style></head><body>${html}</body></html>`;

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:#fff;";
  container.innerHTML = pageHtml;
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
