/**
 * Markdown + PDF 背景 → HTML → PNG → jsPDF 导出。
 * 在 PDF 模版页上渲染 Markdown 内容，保留原始设计。
 */
import { marked } from "marked";

const A4_W = 794;
const SCALE = 2;

// ── 渲染 PDF 某一页为背景图 ──
async function renderPdfPage(pdfUrl: string, pageNum: number): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
  const page = await pdf.getPage(pageNum);
  const vp = page.getViewport({ scale: SCALE });
  const c = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  await page.render({ canvas: c, viewport: vp }).promise;
  return c.toDataURL("image/png");
}

// ── 构建单页 HTML：PDF 背景 + Markdown 内容 ──
function buildPage(bgUrl: string, content: string, pageNum: number, totalPages: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${A4_W}px;background:transparent url(${bgUrl}) no-repeat;background-size:${A4_W}px auto;font-family:'PingFang SC','Heiti SC','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.8;color:#000;padding:60px 72px}
h1{font-size:28px;margin-bottom:12px;text-align:center}
h2{font-size:18px;margin:28px 0 10px;border-bottom:1px solid #333;padding-bottom:4px}
h3{font-size:15px;margin:16px 0 6px}
p,li,div{background:rgba(255,255,255,0.85);display:inline;padding:1px 4px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
ul,ol{margin:6px 0 6px 20px}
li{margin:4px 0;display:list-item;background:rgba(255,255,255,0.85);padding:1px 4px}
img{max-width:120px;height:auto;background:none}
.footer{position:fixed;bottom:20px;right:72px;font-size:10px;color:#999;background:rgba(255,255,255,0.7);padding:2px 6px}
</style></head><body>${content}<div class="footer">${pageNum}/${totalPages}</div></body></html>`;
}

export async function renderAllPages(
  markdown: string,
  pdfUrl?: string,
  _blocks?: unknown[],
  _mods?: unknown[],
  _edits?: Record<string, string>,
  _del?: Set<string>,
  _imgs?: Record<string, unknown>,
  _delImgs?: Set<string>,
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const html = await marked.parse(markdown);

  // 获取 PDF 页数
  let numPages = 1;
  let bgUrls: string[] = [];
  if (pdfUrl) {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
      numPages = pdf.numPages;
      bgUrls = await Promise.all(
        Array.from({ length: numPages }, (_, i) => renderPdfPage(pdfUrl, i + 1))
      );
    } catch { /* fallback: white background */ }
  }

  const { toPng } = await import("html-to-image");

  // 估算每页能容纳的字符数，按比例分配到各页
  const charsPerPage = Math.ceil(html.length / numPages);
  const result: string[] = [];

  for (let p = 0; p < numPages; p++) {
    onProgress?.(p + 1, numPages);
    const chunk = html.slice(p * charsPerPage, (p + 1) * charsPerPage);
    const bg = bgUrls[p] ?? "";
    const pageHtml = buildPage(bg, chunk, p + 1, numPages);

    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:0;top:0;width:${A4_W}px;z-index:99999;background:#fff;`;
    container.innerHTML = pageHtml;
    document.body.appendChild(container);

    await new Promise(r => requestAnimationFrame(r));
    const imgs = container.querySelectorAll("img");
    await Promise.all([...imgs].map(i => new Promise<void>(r => { if (i.complete) r(); else { i.onload = () => r(); i.onerror = () => r(); } })));

    const dataUrl = await toPng(container, { pixelRatio: SCALE, backgroundColor: "#ffffff" });
    document.body.removeChild(container);
    result.push(dataUrl);
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
