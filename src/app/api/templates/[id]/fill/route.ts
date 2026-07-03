/**
 * POST /api/templates/[id]/fill
 * pdf-lib + fontkit → 嵌入 CJK 字体 → PDF 原位文字替换 + 自定义页。
 *
 * Part A: 所有文字块原位编辑（涂白+重写），保留原布局
 * Part B: 已编辑模块在末尾追加 RichTextEditor 内容，流式排版
 * Part C: 自定义页（复制模版底版 + 涂白 + 渲染）
 */
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// ── CJK 字体 ──
let _fontBytes: ArrayBuffer | null = null;
async function getCjkFont(): Promise<ArrayBuffer> {
  if (_fontBytes) return _fontBytes;
  const p = path.resolve(process.cwd(), "public", "NotoSansSC-Regular.otf");
  if (fs.existsSync(p)) { _fontBytes = fs.readFileSync(p).buffer; return _fontBytes!; }
  throw new Error("请先下载 CJK 字体");
}

// ── 类型 ──
interface EditItem { page: number; x: number; y: number; w: number; h: number; fontSize: number; text: string; color?: string; }
interface BlockCoord { x: number; y: number; w: number; h: number; fontSize: number; color: string; deleted?: boolean; }
interface ModuleEdit { moduleId: string; label: string; page: number; html: string; blocks: BlockCoord[]; edited?: boolean; }
interface CustomPageItem { markdown: string; }

// ── 常量 ──
const A4_W = 595;
const A4_H = 842;
const MARGIN_X = 50;
const MARGIN_Y = 50;
const LINE_RATIO = 1.6;

// ── HTML → TextLine ──
interface TextLine { text: string; fontSize: number; indent: number; spaceBefore: number; spaceAfter: number; bold: boolean; color?: string; }

function parseHtmlToLines(html: string, titleSize: number, bodySize: number): TextLine[] {
  const text = html
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”").replace(/&mdash;/g, "—");

  function collectInline(h: string): { plain: string; color?: string } {
    const cm = h.match(/<span\s[^>]*style\s*=\s*"[^"]*color\s*:\s*([^;"]+)[^"]*"/i);
    return { plain: h.replace(/<[^>]*>/g, "").trim(), color: cm?.[1]?.trim() };
  }

  const blocks = text.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>|<(?:ul|ol)[^>]*>[\s\S]*?<\/(?:ul|ol)>)/gi);
  const lines: TextLine[] = [];
  let prev = "";

  for (const block of blocks) {
    if (!block.trim()) continue;

    const hm = block.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
    if (hm) {
      const sizes = [titleSize + 6, titleSize + 4, titleSize, titleSize - 2, titleSize - 2, titleSize - 2];
      const il = collectInline(hm[2]);
      if (il.plain) lines.push({ text: il.plain, fontSize: sizes[Math.min(parseInt(hm[1]) - 1, 5)], indent: 0, spaceBefore: parseInt(hm[1]) === 1 ? 14 : 10, spaceAfter: 6, bold: true, color: il.color });
      prev = "heading";
      continue;
    }

    const pm = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pm && !/<(?:ul|ol|li)/i.test(block)) {
      if (prev) lines.push({ text: "", fontSize: bodySize, indent: 0, spaceBefore: 4, spaceAfter: 0, bold: false });
      const il = collectInline(pm[1]);
      if (il.plain) lines.push({ text: il.plain, fontSize: bodySize, indent: 0, spaceBefore: 0, spaceAfter: 0, bold: false, color: il.color });
      prev = "p";
      continue;
    }

    const lm = block.match(/<li[^>]*>([\s\S]*?)<\/li>/i);
    if (lm) {
      const il = collectInline(lm[1].replace(/<p[^>]*>/gi, "").replace(/<\/p>/gi, ""));
      if (il.plain) lines.push({ text: `• ${il.plain}`, fontSize: bodySize, indent: 18, spaceBefore: 1, spaceAfter: 0, bold: false, color: il.color });
      prev = "li";
      continue;
    }

    if (/^<\/(?:ul|ol)>/i.test(block.trim()) || /^<(?:ul|ol)[^>]*>/i.test(block.trim())) continue;

    const plain = block.replace(/<[^>]*>/g, "").trim();
    if (plain) {
      if (prev) lines.push({ text: "", fontSize: bodySize, indent: 0, spaceBefore: 4, spaceAfter: 0, bold: false });
      lines.push({ text: plain, fontSize: bodySize, indent: 0, spaceBefore: 0, spaceAfter: 0, bold: false });
      prev = "p";
    }
  }

  return lines;
}

// ── 辅助 ──
function parseHex(hex: string) {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}
function mostCommon(vals: string[]): string | undefined {
  const f = new Map<string, number>();
  for (const v of vals) f.set(v, (f.get(v) ?? 0) + 1);
  let b = vals[0]; let bn = 0;
  for (const [k, n] of f) if (n > bn) { bn = n; b = k; }
  return b;
}
function median(vals: number[]): number | undefined {
  if (!vals.length) return undefined;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
function whiteOut(page: ReturnType<PDFDocument["getPages"]>[0], b: { x: number; y: number; w: number; h: number; fontSize: number }) {
  const fs = b.fontSize || 12;
  const dp = Math.max(fs * 0.3, 6);
  page.drawRectangle({ x: b.x - 4, y: b.y - dp, width: b.w + 8, height: b.h + dp + 8, color: rgb(1, 1, 1) });
}

// ═══════════════════════════════════════════════════════
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as { strayEdits?: EditItem[]; moduleEdits?: ModuleEdit[]; customPages?: CustomPageItem[] };
    const { strayEdits = [], moduleEdits = [], customPages = [] } = body;

    const pdfPath = path.resolve(process.cwd(), "public/uploads/templates", `${id}.pdf`);
    if (!fs.existsSync(pdfPath)) return NextResponse.json({ error: "模版不存在" }, { status: 404 });

    const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await getCjkFont();
    const font = await pdfDoc.embedFont(fontBytes);
    const pages = pdfDoc.getPages();

    // 风格提取
    const allColors = [...strayEdits.filter(e => e.color).map(e => e.color!), ...moduleEdits.flatMap(m => m.blocks.filter(b => b.color).map(b => b.color))];
    const dominantColor = mostCommon(allColors) || "#333333";
    const allSizes = [...strayEdits.filter(e => e.fontSize > 0).map(e => e.fontSize), ...moduleEdits.flatMap(m => m.blocks.filter(b => b.fontSize > 0).map(b => b.fontSize))];
    const titleSize = median(allSizes.filter(s => s >= 16)) || 18;
    const bodySize = median(allSizes.filter(s => s < 16)) || 11;

    // ═══ Part A: 所有块原位编辑 ═══
    // Pass A1: 涂白
    for (const e of strayEdits) {
      if (e.page < 1 || e.page > pages.length) continue;
      whiteOut(pages[e.page - 1], e);
    }
    // Pass A2: 原位画新字
    for (const e of strayEdits) {
      if (e.page < 1 || e.page > pages.length) continue;
      if (!e.text?.trim()) continue;
      pages[e.page - 1].drawText(e.text, {
        x: e.x + 1, y: e.y, size: e.fontSize || 12, font,
        color: e.color ? parseHex(e.color) : rgb(0, 0, 0),
      });
    }

    // ═══ Part B: 已编辑模块末尾追加内容 ═══
    const editedModules = moduleEdits.filter(m => m.edited && m.html?.trim());
    const pageCursors: number[] = [];

    for (const mod of editedModules) {
      if (mod.page < 1 || mod.page > pages.length) continue;
      const page = pages[mod.page - 1];
      const { height: ph } = page.getSize();

      // 追加起点 = 该模块最下方块的底部 - 间距
      const moduleBottom = Math.min(...mod.blocks.map(b => b.y));
      const prevY = pageCursors[mod.page];
      let y: number;
      if (prevY !== undefined) {
        y = Math.min(moduleBottom - 12, prevY - bodySize);
      } else {
        y = moduleBottom - 12;
      }
      if (y < MARGIN_Y) continue;

      const lines = parseHtmlToLines(mod.html, titleSize, bodySize);
      if (!lines.length) continue;

      for (const line of lines) {
        if (!line.text) { y -= bodySize * 0.6; continue; }
        y -= line.spaceBefore;
        if (y < MARGIN_Y) { y = ph - MARGIN_Y; }

        page.drawText(line.text, {
          x: MARGIN_X + line.indent, y,
          size: line.fontSize, font,
          color: line.color ? parseHex(line.color) : parseHex(dominantColor),
        });
        y -= line.fontSize * LINE_RATIO + line.spaceAfter;
      }

      pageCursors[mod.page] = y;
    }

    // ═══ Part C: 自定义页 ═══
    if (customPages.length) {
      const templateDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
      const page1Blocks = moduleEdits.filter(m => m.page === 1).flatMap(m => m.blocks);

      for (const cp of customPages) {
        if (!cp.markdown?.trim()) continue;
        const lines = parseHtmlToLines(cp.markdown, titleSize, bodySize);
        if (!lines.length) continue;

        const [copied] = await pdfDoc.copyPages(templateDoc, [0]);
        let curPage = pdfDoc.addPage(copied);

        for (const tb of page1Blocks) whiteOut(curPage, tb);

        const topBlock = page1Blocks.length > 0
          ? page1Blocks.reduce((max, b) => b.y + b.h > max.y + max.h ? b : max) : null;
        let y = topBlock ? topBlock.y + topBlock.h + 12 : A4_H - MARGIN_Y;

        for (const line of lines) {
          if (!line.text) { y -= bodySize * 0.6; continue; }
          y -= line.spaceBefore;
          if (y < MARGIN_Y) { curPage = pdfDoc.addPage([A4_W, A4_H]); y = A4_H - MARGIN_Y - line.spaceBefore; }
          curPage.drawText(line.text, {
            x: MARGIN_X + line.indent, y, size: line.fontSize, font,
            color: line.color ? parseHex(line.color) : parseHex(dominantColor),
          });
          y -= line.fontSize * LINE_RATIO + line.spaceAfter;
        }
      }
    }

    // 保存
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
