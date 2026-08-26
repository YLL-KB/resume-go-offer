/**
 * 模板路由 — 列表 / 上传 / 预览 / 删除 / 填充 / 摘要 / 分析 / 提取 markdown。
 */

import { Hono } from "hono";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ai, runWithAIConfig } from "../lib/ai";
import { getAuthUserId } from "../lib/auth/utils";
import { runWithUsage } from "../lib/billing/ledger";
import { getUserAiConfigs } from "../lib/billing/byok";

export const templatesRoutes = new Hono();

const TEMPLATE_DIR = () => path.join(process.cwd(), "public", "uploads", "templates");

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

const A4_W = 595;
const A4_H = 842;
const MARGIN_X = 50;
const MARGIN_Y = 50;
const LINE_RATIO = 1.6;

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

// ── GET /api/templates ──
templatesRoutes.get("/", async (c) => {
  try {
    const uploadDir = TEMPLATE_DIR();
    const uploaded: Record<string, unknown>[] = [];

    try {
      await fsPromises.access(uploadDir);
      const files = await fsPromises.readdir(uploadDir);
      const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

      for (const mf of metaFiles) {
        try {
          const raw = await fsPromises.readFile(path.join(uploadDir, mf), "utf-8");
          const meta = JSON.parse(raw);
          uploaded.push({
            id: meta.id,
            name: meta.name,
            desc: `自定义上传 — ${meta.fileName ?? ""}`,
            url: `/api/templates/${meta.id}`,
            builtIn: false,
            uploadedAt: meta.uploadedAt,
            layout: meta.layout ?? "classic",
          });
        } catch {
          // 跳过损坏的元数据
        }
      }
    } catch {
      // uploadDir 不存在，返回空列表
    }

    uploaded.sort((a, b) => {
      const aBuiltIn = a.builtIn as boolean;
      const bBuiltIn = b.builtIn as boolean;
      if (aBuiltIn && !bBuiltIn) return -1;
      if (!aBuiltIn && bBuiltIn) return 1;
      const ta = a.uploadedAt ? new Date(a.uploadedAt as string).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt as string).getTime() : 0;
      return tb - ta;
    });

    return c.json(uploaded);
  } catch (err) {
    console.error("Templates list error:", err);
    return c.json([]);
  }
});

// ── GET /api/templates/:id ──
templatesRoutes.get("/:id", async (c) => {
  const rawId = c.req.param("id");
  const id = rawId.endsWith(".pdf") ? rawId.slice(0, -4) : rawId;
  const pdfPath = path.join(TEMPLATE_DIR(), `${id}.pdf`);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fsPromises.readFile(pdfPath);
  } catch {
    return c.json({ error: "模版文件不存在" }, 404);
  }

  const isDownload = c.req.query("download") === "1";

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=3600",
      ...(isDownload
        ? { "Content-Disposition": `attachment; filename="${id}.pdf"` }
        : { "Content-Disposition": "inline" }),
    },
  });
});

// ── DELETE /api/templates/:id ──
templatesRoutes.delete("/:id", async (c) => {
  const rawId = c.req.param("id");
  const id = rawId.endsWith(".pdf") ? rawId.slice(0, -4) : rawId;
  const pdfPath = path.join(TEMPLATE_DIR(), `${id}.pdf`);
  const metaPath = path.join(TEMPLATE_DIR(), `${id}.meta.json`);

  const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
  if (isAnonymous) {
    return c.json({ error: "请先登录" }, 401);
  }

  try {
    const raw = await fsPromises.readFile(metaPath, "utf-8");
    const meta = JSON.parse(raw);
    if (meta.uploadedBy && meta.uploadedBy !== userId) {
      return c.json({ error: "无权删除此模版" }, 403);
    }
  } catch {
    // meta 不存在 → 后面会返回 404
  }

  const builtInIds = ["classic", "modern", "minimal"];
  if (builtInIds.includes(id)) {
    return c.json({ error: "内置模版不可删除" }, 403);
  }

  let metaExists = false;
  try {
    await fsPromises.access(metaPath);
    metaExists = true;
  } catch {
    // meta 不存在
  }

  if (!metaExists) {
    return c.json({ error: "模版不存在" }, 404);
  }

  const errors: string[] = [];
  for (const p of [pdfPath, metaPath]) {
    try {
      await fsPromises.unlink(p);
    } catch {
      errors.push(p);
    }
  }

  if (errors.length > 0) {
    console.error("Template delete partial error:", errors);
    return c.json({ error: "部分文件删除失败" }, 500);
  }

  return c.json({ success: true, id });
});

// ── POST /api/templates/upload ──
templatesRoutes.post("/upload", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "请上传一个 PDF 文件" }, 400);
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return c.json({ error: "仅支持 PDF 格式的模版文件" }, 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "文件大小不能超过 10MB" }, 400);
    }

    const id = crypto.randomUUID();

    const uploadDir = TEMPLATE_DIR();
    await fsPromises.mkdir(uploadDir, { recursive: true });

    const pdfPath = path.join(uploadDir, `${id}.pdf`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fsPromises.writeFile(pdfPath, buffer);

    const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
    if (isAnonymous) {
      return c.json({ error: "请先登录后再上传模版" }, 401);
    }

    const customName = formData.get("name")?.toString().trim();
    const layoutField = formData.get("layout")?.toString().trim() || "classic";
    const meta = {
      id,
      name: customName || file.name.replace(/\.pdf$/i, ""),
      fileName: file.name,
      size: file.size,
      layout: layoutField,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId,
    };
    await fsPromises.writeFile(
      path.join(uploadDir, `${id}.meta.json`),
      JSON.stringify(meta, null, 2),
    );

    return c.json(
      {
        id: meta.id,
        name: meta.name,
        url: `/api/templates/${id}`,
        uploadedAt: meta.uploadedAt,
      },
      201,
    );
  } catch (err) {
    console.error("Template upload error:", err);
    return c.json({ error: "上传失败，请稍后再试" }, 500);
  }
});

// ── POST /api/templates/:id/fill ──
templatesRoutes.post("/:id/fill", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json() as { strayEdits?: EditItem[]; moduleEdits?: ModuleEdit[]; customPages?: CustomPageItem[]; source?: string };
    const { strayEdits = [], moduleEdits = [], customPages = [], source } = body;

    const pdfDir = source === "analysis" ? "public/uploads/analysis" : "public/uploads/templates";
    const pdfPath = path.resolve(process.cwd(), pdfDir, `${id}.pdf`);
    if (!fs.existsSync(pdfPath)) return c.json({ error: source === "analysis" ? "分析文件不存在或已过期" : "模版不存在" }, 404);

    const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await getCjkFont();
    const font = await pdfDoc.embedFont(fontBytes);
    const pages = pdfDoc.getPages();

    const allColors = [...strayEdits.filter(e => e.color).map(e => e.color!), ...moduleEdits.flatMap(m => m.blocks.filter(b => b.color).map(b => b.color))];
    const dominantColor = mostCommon(allColors) || "#333333";
    const allSizes = [...strayEdits.filter(e => e.fontSize > 0).map(e => e.fontSize), ...moduleEdits.flatMap(m => m.blocks.filter(b => b.fontSize > 0).map(b => b.fontSize))];
    const titleSize = median(allSizes.filter(s => s >= 16)) || 18;
    const bodySize = median(allSizes.filter(s => s < 16)) || 11;

    // Part A: 所有块原位编辑
    for (const e of strayEdits) {
      if (e.page < 1 || e.page > pages.length) continue;
      whiteOut(pages[e.page - 1], e);
    }
    for (const e of strayEdits) {
      if (e.page < 1 || e.page > pages.length) continue;
      if (!e.text?.trim()) continue;
      pages[e.page - 1].drawText(e.text, {
        x: e.x + 1, y: e.y, size: e.fontSize || 12, font,
        color: e.color ? parseHex(e.color) : rgb(0, 0, 0),
      });
    }

    // Part B: 已编辑模块末尾追加内容
    const editedModules = moduleEdits.filter(m => m.edited && m.html?.trim());
    const pageCursors: number[] = [];

    for (const mod of editedModules) {
      if (mod.page < 1 || mod.page > pages.length) continue;
      const page = pages[mod.page - 1];
      const { height: ph } = page.getSize();

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

    // Part C: 自定义页
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

    const filledBytes = await pdfDoc.save();
    const filledDir = path.resolve(process.cwd(), "public/filled");
    if (!fs.existsSync(filledDir)) fs.mkdirSync(filledDir, { recursive: true });
    const filledPath = path.join(filledDir, `${id}.pdf`);
    fs.writeFileSync(filledPath, filledBytes);

    return c.json({ url: `/filled/${id}.pdf?t=${Date.now()}` });
  } catch (err) {
    console.error("PDF fill error:", err);
    return c.json({ error: "填充失败" }, 500);
  }
});

// ── POST /api/templates/:id/summary ──
templatesRoutes.post("/:id/summary", async (c) => {
  const id = c.req.param("id");
  const pdfPath = path.join(TEMPLATE_DIR(), `${id}.pdf`);

  try { await fsPromises.access(pdfPath); } catch {
    return c.json({ error: "模版文件不存在" }, 404);
  }

  try {
    const pdfBuffer = await fsPromises.readFile(pdfPath);
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), "public", "pdf.worker.mjs");

    const pdf = await pdfjs.getDocument({ data: pdfBuffer.buffer }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texts.push(content.items.map((item: unknown) => (item as { str?: string }).str ?? "").join(" "));
    }
    const fullText = texts.join("\n").trim();

    if (fullText.length < 20) {
      let name = id;
      try {
        const metaRaw = await fsPromises.readFile(path.join(TEMPLATE_DIR(), `${id}.meta.json`), "utf-8");
        name = JSON.parse(metaRaw).name ?? id;
      } catch { /* ignore */ }
      return c.json({ title: name, summary: "该 PDF 内可提取的文本内容较少，无法自动生成摘要。", rawLength: fullText.length });
    }

    const { userId } = await getAuthUserId(c.req.raw);
    const userCfg = getUserAiConfigs(userId).chat;
    const runtimeCfg = userCfg ? { baseUrl: userCfg.baseUrl, apiKey: userCfg.apiKey, model: userCfg.model } : null;
    const { title, summary } = await runWithUsage({ userId, provider: runtimeCfg ? "byok" : "platform" }, () =>
      runWithAIConfig(runtimeCfg ? { chat: runtimeCfg } : null, () => ai.summarizeTemplate(fullText)),
    );

    return c.json({ title, summary, rawLength: fullText.length });
  } catch (err) {
    console.error("Template summary error:", err);
    return c.json({ error: "分析失败，请稍后再试" }, 500);
  }
});

// ── POST /api/templates/:id/analyze ──
templatesRoutes.post("/:id/analyze", async (c) => {
  const id = c.req.param("id");
  const pdfPath = path.join(TEMPLATE_DIR(), `${id}.pdf`);

  try { await fsPromises.access(pdfPath); } catch {
    return c.json({ error: "模版文件不存在" }, 404);
  }

  try {
    const buffer = await fsPromises.readFile(pdfPath);
    const raw = buffer.toString("utf-8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
    const textMatches = raw.match(/\(([^)]*)\)/g) || [];
    const chunks = textMatches
      .map(m => m.slice(1, -1))
      .filter(t => t.length > 2 && /[一-鿿]/.test(t) && !t.includes("\\"));
    const text = chunks.join("\n").trim();

    if (text.length < 30) {
      return c.json({
        layout: "single-column",
        sections: [
          { id: "basic", label: "个人信息", order: 0, type: "header", description: "姓名、联系方式等基本信息" },
          { id: "experience", label: "工作经历", order: 1, type: "experience", description: "过往工作经历" },
          { id: "education", label: "教育背景", order: 2, type: "education", description: "学历信息" },
          { id: "skills", label: "技能", order: 3, type: "skills", description: "专业技能列表" },
        ],
        style_hints: { has_photo_area: false, section_separator: "line" },
        warning: "PDF 文本提取有限，使用默认结构",
      });
    }

    const { userId } = await getAuthUserId(c.req.raw);
    const userCfg = getUserAiConfigs(userId).chat;
    const runtimeCfg = userCfg ? { baseUrl: userCfg.baseUrl, apiKey: userCfg.apiKey, model: userCfg.model } : null;
    const analysis = await runWithUsage({ userId, provider: runtimeCfg ? "byok" : "platform" }, () =>
      runWithAIConfig(runtimeCfg ? { chat: runtimeCfg } : null, () => ai.analyzeTemplate(text)),
    );

    const metaPath = path.join(TEMPLATE_DIR(), `${id}.meta.json`);
    try {
      const raw = await fsPromises.readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      meta.analysis = analysis;
      await fsPromises.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* 写不进去就算了 */ }

    return c.json({ ...analysis, cached: false });
  } catch (err) {
    console.error("Template analysis error:", err);
    return c.json({ error: "分析失败", detail: String(err) }, 500);
  }
});

// ── GET /api/templates/:id/extract-markdown ──
templatesRoutes.get("/:id/extract-markdown", async (c) => {
  async function enrichWithLayout(
    pdfPath: string,
    contentList: Record<string, unknown>[] | null,
  ): Promise<Record<string, unknown>[] | null> {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) return contentList;

    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const base64Pdf = pdfBuffer.toString("base64");

      const systemPrompt = `你是一个专业的文档布局分析工具。分析这页PDF的布局结构。

返回纯 JSON 数组（不要 markdown 代码块）：
[{
  "type": "text" | "table" | "image",
  "x": 数字（左边界，PDF 坐标系，A4 约 0-595），
  "y": 数字（底边界，PDF 坐标系，A4 约 0-842），
  "w": 数字（宽度），
  "h": 数字（高度），
  "content": "元素内容描述"
}]

规则：
- 坐标使用 PDF 标准坐标系（左下角原点，x→右，y→上）
- 每个独立文字区域一个元素，表格用 Markdown 描述
- 不要遗漏任何可见元素`;

      const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "glm-4v",
          temperature: 0.1,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "分析此PDF的完整布局结构，返回JSON数组。" },
                { type: "file", file: { file_data: base64Pdf, file_name: "document.pdf" } },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        console.warn("GLM-OCR API error:", res.status);
        return contentList;
      }

      const data = await res.json() as { choices: [{ message: { content: string } }] };
      const raw = data.choices[0]?.message?.content ?? "";
      const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();

      try {
        const layoutElements = JSON.parse(cleaned) as Record<string, unknown>[];
        if (contentList?.length && layoutElements.length) {
          return contentList.map((item, i) => {
            const layout = layoutElements[i] ?? layoutElements.find(
              (el) => Math.abs((el.y as number) - ((item.bbox as number[] | undefined)?.[1] ?? 0)) < 20,
            );
            return {
              ...item,
              layoutType: layout?.type ?? "text",
              layoutBbox: layout ? { x: layout.x, y: layout.y, w: layout.w, h: layout.h } : undefined,
            };
          });
        }
        return layoutElements;
      } catch {
        return contentList;
      }
    } catch (err) {
      console.warn("GLM-OCR layout enrichment failed:", (err as Error).message);
      return contentList;
    }
  }

  try {
    const id = c.req.param("id");
    const isAnalysis = c.req.query("source") === "analysis";
    const dir = isAnalysis ? "public/uploads/analysis" : "public/uploads/templates";
    const pdfPath = path.resolve(process.cwd(), dir, `${id}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      return c.json({ error: isAnalysis ? "分析文件不存在或已过期" : "模版文件不存在" }, 404);
    }

    const enableLayout = c.req.query("layout") === "true";

    const { MinerU } = await import("mineru-open-sdk");
    const token = process.env["MINERU_TOKEN"];

    let markdown = "";
    let contentList: Record<string, unknown>[] | null = null;
    let source = "none";
    const warnings: string[] = [];

    if (token) {
      try {
        const client = new MinerU(token);
        const result = await client.extract(pdfPath);
        markdown = result.markdown ?? "";
        contentList = result.contentList as Record<string, unknown>[] | null;
        source = "mineru";
      } catch (err) {
        const msg = (err as Error).message;
        console.warn("MinerU Extract 失败，降级 Flash:", msg);
        warnings.push(`MinerU Extract 失败(${msg.slice(0, 60)})，已降级为 Flash 模式（精度较低）`);
      }
    } else {
      console.warn("[MinerU] MINERU_TOKEN 未设置，使用 Flash 模式。在 .env.local 中配置 MINERU_TOKEN 可启用高精度解析。");
      warnings.push("未启用 AI 文档解析，简历识别精度受限");
    }

    if (!markdown) {
      try {
        const client = new MinerU();
        const result = await client.flashExtract(pdfPath);
        markdown = result.markdown ?? "";
        if (source === "none") source = "mineru-flash";
      } catch {
        warnings.push("简历解析服务暂不可用，已使用备用方案提取文本");
      }
    }

    if (!markdown) {
      warnings.push("无法解析此 PDF 文件，请确认文件可正常打开");
    }

    let layoutElements: Record<string, unknown>[] | null = null;
    if (enableLayout && markdown) {
      layoutElements = await enrichWithLayout(pdfPath, contentList);
      if (layoutElements) source += "+glm-ocr";
    }

    return c.json({
      markdown,
      contentList,
      layoutElements: layoutElements ?? undefined,
      source,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    console.error("提取失败:", err);
    return c.json({ error: "提取失败" }, 500);
  }
});
