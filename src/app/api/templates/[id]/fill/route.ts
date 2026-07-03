/**
 * POST /api/templates/[id]/fill
 * pdf-lib + fontkit → 嵌入 CJK 字体 → 直接在 PDF 原位替换文字。
 * 支持自定义页面追加（Markdown 渲染到空白 A4 页）。
 */
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// ── CJK 字体加载 ──
let _fontBytes: ArrayBuffer | null = null;
async function getCjkFont(): Promise<ArrayBuffer> {
  if (_fontBytes) return _fontBytes;
  const localPath = path.resolve(process.cwd(), "public", "NotoSansSC-Regular.otf");
  if (fs.existsSync(localPath)) { _fontBytes = fs.readFileSync(localPath).buffer; return _fontBytes!; }
  throw new Error("请先下载 CJK 字体: curl -L -o public/NotoSansSC-Regular.otf https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf");
}

interface EditItem { page: number; x: number; y: number; w: number; h: number; fontSize: number; text: string; color?: string; }
interface TemplateBlock { page: number; x: number; y: number; w: number; h: number; fontSize: number; color?: string; }
interface CustomPageItem { markdown: string; }

// ── A4 排版常量 ──
const A4_W = 595;
const A4_H = 842;
const MARGIN_X = 50;
const MARGIN_Y = 50;
const LINE_RATIO = 1.6;

// ── HTML → 文本块 ──
interface TextLine {
  text: string;
  fontSize: number;
  indent: number;
  spaceBefore: number;
  spaceAfter: number;
  bold: boolean;
}

function htmlToTextLines(html: string, titleSize: number, bodySize: number): TextLine[] {
  // 解码常用 HTML 实体
  let text = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&mdash;/g, "—");

  // 块级标签 → 标记（只处理开头标签，闭合标签单独剥离）
  text = text.replace(/<h([1-3])(?:\s[^>]*)?>/gi, (_, n) => `\n[H${n}]`);
  text = text.replace(/<\/h[1-3]>/gi, "");
  text = text.replace(/<li(?:\s[^>]*)?>/gi, "\n[LI]");
  text = text.replace(/<\/li>/gi, "");
  text = text.replace(/<\/?[uo]l(?:\s[^>]*)?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<p(?:\s[^>]*)?>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<div(?:\s[^>]*)?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "");

  // 剥离所有剩余 HTML 标签
  text = text.replace(/<[^>]*>/g, "");

  const lines: TextLine[] = [];
  let prevEmpty = false;

  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (!prevEmpty && lines.length > 0) lines.push({ text: "", fontSize: bodySize, indent: 0, spaceBefore: 0, spaceAfter: 0, bold: false });
      prevEmpty = true;
      continue;
    }
    prevEmpty = false;

    let fontSize = bodySize;
    let indent = 0;
    let spaceBefore = 4;
    let spaceAfter = 0;
    let lineText = trimmed;
    let bold = false;

    // 检测标记 [H1]/[H2]/[H3]/[LI]
    if (lineText.startsWith("[H1]")) {
      fontSize = titleSize + 4;
      lineText = lineText.slice(4).trim();
      spaceBefore = 12; spaceAfter = 6;
      bold = true;
    } else if (lineText.startsWith("[H2]")) {
      fontSize = titleSize;
      lineText = lineText.slice(4).trim();
      spaceBefore = 10; spaceAfter = 4;
      bold = true;
    } else if (lineText.startsWith("[H3]")) {
      fontSize = titleSize - 2;
      lineText = lineText.slice(4).trim();
      spaceBefore = 8; spaceAfter = 2;
      bold = true;
    } else if (lineText.startsWith("[LI]")) {
      indent = 18;
      lineText = lineText.slice(4).trim();
      spaceBefore = 1;
    }

    if (lineText) {
      lines.push({ text: lineText, fontSize, indent, spaceBefore, spaceAfter, bold });
    }
  }

  return lines;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json() as { edits: EditItem[]; templateBlocks?: TemplateBlock[]; customPages?: CustomPageItem[] };
    const { edits = [], templateBlocks = [], customPages = [] } = body;
    if (!edits.length && !customPages.length) return NextResponse.json({ error: "缺少编辑数据" }, { status: 400 });

    const pdfPath = path.resolve(process.cwd(), "public/uploads/templates", `${id}.pdf`);
    if (!fs.existsSync(pdfPath)) return NextResponse.json({ error: "模版不存在" }, { status: 404 });

    const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
    pdfDoc.registerFontkit(fontkit);

    // 嵌入 CJK 字体
    const fontBytes = await getCjkFont();
    const font = await pdfDoc.embedFont(fontBytes);

    // ── 从模版文字块中提取风格（优先 edits，其次 templateBlocks）──
    const allColors = [...edits.filter(e => e.color).map(e => e.color!), ...templateBlocks.filter(b => b.color).map(b => b.color!)];
    const dominantColor = mostCommon(allColors) || "#333333";
    const allSizes = [...edits.filter(e => e.fontSize > 0).map(e => e.fontSize), ...templateBlocks.filter(b => b.fontSize > 0).map(b => b.fontSize)];
    const titleSize = median(allSizes.filter(s => s >= 16)) || 18;
    const bodySize = median(allSizes.filter(s => s < 16)) || 11;

    const pages = pdfDoc.getPages();

    // ═══════════════════════════════════════════════════════
    // Part A: 模版页文字替换
    // ═══════════════════════════════════════════════════════

    // Pass 1: 白色矩形覆盖原文
    for (const e of edits) {
      if (e.page < 1 || e.page > pages.length) continue;
      const page = pages[e.page - 1];
      const fs = e.fontSize || 12;

      const estimatedNewWidth = e.text.length * fs * 0.6 + 16;
      const coverWidth = Math.max(e.w + 8, estimatedNewWidth);
      const descenderPad = Math.max(fs * 0.3, 6);

      page.drawRectangle({
        x: e.x - 4,
        y: e.y - descenderPad,
        width: coverWidth,
        height: e.h + descenderPad + 8,
        color: rgb(1, 1, 1),
      });
    }

    // Pass 2: 画新文字
    for (const e of edits) {
      if (e.page < 1 || e.page > pages.length) continue;
      if (!e.text?.trim()) continue;
      const page = pages[e.page - 1];
      const fs = e.fontSize || 12;

      page.drawText(e.text, {
        x: e.x + 1,
        y: e.y,
        size: fs,
        font,
        color: e.color ? parseHex(e.color) : rgb(0, 0, 0),
      });
    }

    // ═══════════════════════════════════════════════════════
    // Part B: 自定义页面（复制模版第一页 → 涂白原文 → 渲染自定义内容）
    // ═══════════════════════════════════════════════════════
    if (customPages.length) {
      // 重新加载模版用于复制页面
      const templateDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
      // 只取第一页的文字块
      const page1Blocks = templateBlocks.filter(b => b.page === 1);

      for (const cp of customPages) {
        if (!cp.markdown?.trim()) continue;

        const lines = htmlToTextLines(cp.markdown, titleSize, bodySize);
        if (!lines.length) continue;

        // 复制模版第一页作为底版
        const [copied] = await pdfDoc.copyPages(templateDoc, [0]);
        let currentPage = pdfDoc.addPage(copied);

        // 涂白第一页上所有文字块
        for (const tb of page1Blocks) {
          const fs = tb.fontSize || 12;
          const descenderPad = Math.max(fs * 0.3, 6);
          currentPage.drawRectangle({
            x: tb.x - 4,
            y: tb.y - descenderPad,
            width: tb.w + 8,
            height: tb.h + descenderPad + 8,
            color: rgb(1, 1, 1),
          });
        }

        // 从第一页顶部文字块下方开始画
        const topBlock = page1Blocks.length > 0
          ? page1Blocks.reduce((max, b) => b.y + b.h > max.y + max.h ? b : max)
          : null;
        let y = topBlock ? topBlock.y + topBlock.h + 12 : A4_H - MARGIN_Y;

        for (const line of lines) {
          if (!line.text) { y -= bodySize * 0.6; continue; }
          y -= line.spaceBefore;

          if (y < MARGIN_Y) {
            // 内容超出当前页 → 追加纯白续页
            currentPage = pdfDoc.addPage([A4_W, A4_H]);
            y = A4_H - MARGIN_Y - line.spaceBefore;
          }

          currentPage.drawText(line.text, {
            x: MARGIN_X + line.indent,
            y,
            size: line.fontSize,
            font,
            color: parseHex(dominantColor),
          });

          y -= line.fontSize * LINE_RATIO + line.spaceAfter;
        }
      }
    }

    const filledBytes = await pdfDoc.save();
    const filledDir = path.resolve(process.cwd(), "public/filled");
    if (!fs.existsSync(filledDir)) fs.mkdirSync(filledDir, { recursive: true });
    const filledPath = path.join(filledDir, `${id}.pdf`);
    fs.writeFileSync(filledPath, filledBytes);

    return NextResponse.json({ url: `/filled/${id}.pdf?t=${Date.now()}` });
  } catch (err) {
    console.error("PDF fill error:", err);
    return NextResponse.json({ error: "填充失败" }, { status: 500 });
  }
}

function parseHex(hex: string) {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

function mostCommon(values: string[]): string | undefined {
  if (!values.length) return undefined;
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best = values[0], bestN = 0;
  for (const [k, n] of freq) if (n > bestN) { bestN = n; best = k; }
  return best;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
