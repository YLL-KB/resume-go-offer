/**
 * PDF 处理路由 — 合并 / 元数据 / 旋转 / 拆分 / OCR 布局分析。
 */

import { Hono } from "hono";
import { PDFDocument, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";

export const pdfRoutes = new Hono();

const ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
const OCR_MODEL = "glm-4v";

async function zhipuChat(messages: unknown[]): Promise<string> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error("ZHIPU_API_KEY 未设置");

  const res = await fetch(`${ZHIPU_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zhipu API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: [{ message: { content: string } }];
  };
  return data.choices[0]?.message?.content ?? "";
}

interface LayoutElement {
  type: "text" | "table" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  confidence?: number;
}

interface PageLayout {
  page: number;
  elements: LayoutElement[];
}

function parseLayoutResponse(raw: string, pageNum: number): PageLayout {
  const cleaned = raw
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const elements = Array.isArray(parsed) ? parsed : parsed.elements ?? [];
    return {
      page: pageNum,
      elements: elements.map((el: Record<string, unknown>) => {
        const bbox = el.bbox as Record<string, unknown> | undefined;
        return {
          type: (el.type as LayoutElement["type"]) ?? "text",
          x: Number(el.x ?? bbox?.x ?? 0),
          y: Number(el.y ?? bbox?.y ?? 0),
          w: Number(el.w ?? bbox?.w ?? el.width ?? 100),
          h: Number(el.h ?? bbox?.h ?? el.height ?? 20),
          content: String(el.content ?? ""),
          confidence: el.confidence != null ? Number(el.confidence) : undefined,
        };
      }),
    };
  } catch {
    return {
      page: pageNum,
      elements: [{ type: "text", x: 0, y: 0, w: 0, h: 0, content: raw }],
    };
  }
}

function publicPath(rel: string): string {
  return path.resolve(process.cwd(), "public", rel.replace(/^\//, ""));
}

// POST /api/pdf/merge
pdfRoutes.post("/merge", async (c) => {
  try {
    const { files } = await c.req.json() as { files: string[] };
    if (!files?.length || files.length < 2) {
      return c.json({ error: "至少需要2个PDF文件" }, 400);
    }

    const mergedDoc = await PDFDocument.create();

    for (const file of files) {
      const filePath = publicPath(file);
      if (!fs.existsSync(filePath)) {
        return c.json({ error: `文件不存在: ${file}` }, 404);
      }

      const srcDoc = await PDFDocument.load(fs.readFileSync(filePath));
      const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const page of copiedPages) {
        mergedDoc.addPage(page);
      }
    }

    const mergedBytes = await mergedDoc.save();
    const outDir = path.resolve(process.cwd(), "public/merged");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outName = `merged-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(outDir, outName), mergedBytes);

    return c.json({ url: `/merged/${outName}` });
  } catch (err) {
    console.error("PDF merge error:", err);
    return c.json({ error: "合并失败" }, 500);
  }
});

// POST /api/pdf/metadata
pdfRoutes.post("/metadata", async (c) => {
  try {
    const { file } = await c.req.json() as { file: string };
    if (!file) return c.json({ error: "缺少 file 参数" }, 400);

    const filePath = publicPath(file);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "文件不存在" }, 404);
    }

    const stat = fs.statSync(filePath);
    const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));

    const pages = pdfDoc.getPages().map((page, i) => {
      const { width, height } = page.getSize();
      return { page: i + 1, width: Math.round(width), height: Math.round(height) };
    });

    return c.json({
      pageCount: pages.length,
      pages,
      fileSize: stat.size,
      title: pdfDoc.getTitle() ?? undefined,
      author: pdfDoc.getAuthor() ?? undefined,
      creator: pdfDoc.getCreator() ?? undefined,
    });
  } catch (err) {
    console.error("PDF metadata error:", err);
    return c.json({ error: "读取失败" }, 500);
  }
});

// POST /api/pdf/ocr-layout
pdfRoutes.post("/ocr-layout", async (c) => {
  try {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: "ZHIPU_API_KEY 未设置。在 .env.local 中添加 ZHIPU_API_KEY 后启用此功能。" },
        503,
      );
    }

    const { file, pages: reqPages } = await c.req.json() as {
      file: string;
      pages?: number[];
    };
    if (!file) return c.json({ error: "缺少 file 参数" }, 400);

    const filePath = publicPath(file);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "文件不存在" }, 404);
    }

    const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));
    const totalPages = pdfDoc.getPageCount();
    const targetPages = reqPages?.length
      ? reqPages.filter(p => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    if (!targetPages.length) {
      return c.json({ error: "页码超出范围" }, 400);
    }

    const pdfBuffer = fs.readFileSync(filePath);
    const base64Pdf = pdfBuffer.toString("base64");

    const results: PageLayout[] = [];

    for (const pageNum of targetPages) {
      const systemPrompt = `你是一个专业的文档布局分析工具。分析这页PDF，提取所有文字块、表格、图片的精确信息。

返回纯 JSON 数组（不要 markdown 代码块），每个元素格式：
{
  "type": "text" | "table" | "image",
  "x": 数字（元素左边界 x 坐标，PDF 坐标系，约 0-595），
  "y": 数字（元素底边界 y 坐标，PDF 坐标系，约 0-842），
  "w": 数字（元素宽度），
  "h": 数字（元素高度），
  "content": "元素内容，文字块返回原文，表格返回 Markdown 格式，图片返回简短描述"
}

规则：
- 坐标使用 PDF 标准坐标系（左下角为原点，x 向右，y 向上）
- A4 页面约 595×842，根据实际页面尺寸调整坐标范围
- 每个独立文字区域作为一个元素（标题、段落、列表项等分开）
- 表格用 Markdown 格式描述（| 列1 | 列2 |）
- 图片描述简短但准确（如"蓝色圆形Logo，直径约50px"）`;

      const userPrompt = `分析第 ${pageNum} 页（共 ${totalPages} 页）的完整布局。请返回 JSON 数组。`;

      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "file",
              file: {
                file_data: base64Pdf,
                file_name: `page-${pageNum}.pdf`,
              },
            },
          ],
        },
      ];

      try {
        const raw = await zhipuChat(messages);
        const layout = parseLayoutResponse(raw, pageNum);
        results.push(layout);
      } catch (err) {
        console.warn(`GLM-OCR page ${pageNum} analysis failed:`, (err as Error).message);
        results.push({ page: pageNum, elements: [] });
      }
    }

    return c.json({
      pages: results,
      source: "glm-ocr",
      model: OCR_MODEL,
    });
  } catch (err) {
    console.error("PDF OCR layout error:", err);
    return c.json({ error: "布局分析失败" }, 500);
  }
});

// POST /api/pdf/rotate
pdfRoutes.post("/rotate", async (c) => {
  try {
    const { file, pages, angle } = await c.req.json() as {
      file: string;
      pages?: number[];
      angle: number;
    };

    if (!file) return c.json({ error: "缺少 file 参数" }, 400);
    if (!angle || ![90, 180, 270].includes(angle)) {
      return c.json({ error: "angle 必须是 90、180 或 270" }, 400);
    }

    const filePath = publicPath(file);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "文件不存在" }, 404);
    }

    const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));
    const totalPages = pdfDoc.getPageCount();

    const targetPages = pages?.length
      ? pages.filter(p => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    for (const pageNum of targetPages) {
      const page = pdfDoc.getPage(pageNum - 1);
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + angle) % 360));
    }

    const outBytes = await pdfDoc.save();
    const outDir = path.resolve(process.cwd(), "public/rotated");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outName = `rotated-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(outDir, outName), outBytes);

    return c.json({ url: `/rotated/${outName}` });
  } catch (err) {
    console.error("PDF rotate error:", err);
    return c.json({ error: "旋转失败" }, 500);
  }
});

// POST /api/pdf/split
pdfRoutes.post("/split", async (c) => {
  function parsePages(input: number[] | string, totalPages: number): number[] {
    if (Array.isArray(input)) return input.filter(p => p >= 1 && p <= totalPages);

    const result: number[] = [];
    const parts = input.split(",");
    for (const part of parts) {
      const range = part.trim().split("-").map(Number);
      if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
        for (let i = Math.max(1, range[0]); i <= Math.min(totalPages, range[1]); i++) {
          result.push(i);
        }
      } else if (!isNaN(range[0])) {
        result.push(range[0]);
      }
    }
    return result.filter(p => p >= 1 && p <= totalPages);
  }

  try {
    const { file, pages } = await c.req.json() as { file: string; pages: number[] | string };
    if (!file) return c.json({ error: "缺少 file 参数" }, 400);
    if (!pages) return c.json({ error: "缺少 pages 参数" }, 400);

    const filePath = publicPath(file);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "文件不存在" }, 404);
    }

    const srcDoc = await PDFDocument.load(fs.readFileSync(filePath));
    const totalPages = srcDoc.getPageCount();
    const pageNums = parsePages(pages, totalPages);

    if (!pageNums.length) {
      return c.json({ error: "页码超出范围" }, 400);
    }

    const outDir = path.resolve(process.cwd(), "public/split");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const urls: string[] = [];
    const indices = pageNums.map(p => p - 1);

    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, indices);
    for (const page of copied) newDoc.addPage(page);

    const outName = `split-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(outDir, outName), await newDoc.save());
    urls.push(`/split/${outName}`);

    return c.json(urls.length === 1 ? { url: urls[0] } : { urls });
  } catch (err) {
    console.error("PDF split error:", err);
    return c.json({ error: "拆分失败" }, 500);
  }
});
