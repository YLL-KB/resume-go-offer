/**
 * POST /api/pdf/ocr-layout
 *
 * 基于智谱 GLM-OCR 的 PDF 深度布局分析。
 * 提取文字块坐标、表格结构、图片描述，返回结构化 JSON。
 *
 * 可选：设置 ZHIPU_API_KEY 后启用。不设置则返回 503。
 *
 * Body: { file: string, pages?: number[] }
 *   file:   public/ 下的 PDF 相对路径
 *   pages:  要分析的页码（1-indexed），默认全部
 *
 * Response:
 * {
 *   pages: [{
 *     page: number,
 *     elements: [{
 *       type: "text" | "table" | "image",
 *       bbox: { x, y, w, h },        // PDF 坐标 (bottom-left)
 *       content: string,              // 文字内容 / Markdown 表格 / 图片描述
 *       confidence?: number
 *     }]
 *   }],
 *   source: "glm-ocr"
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
const OCR_MODEL = "glm-4v"; // GLM-4V 多模态模型，支持图片/PDF 分析

// ── Zhipu API 调用 ──
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

// ── 解析 AI 返回的布局 JSON ──
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
  // 尝试解析 JSON
  const cleaned = raw
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    // 支持两种格式：直接数组 或 { elements: [...] }
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
      };}),
    };
  } catch {
    // 解析失败，返回原始文本作为单元素
    return {
      page: pageNum,
      elements: [{ type: "text", x: 0, y: 0, w: 0, h: 0, content: raw }],
    };
  }
}

// ── 主路由 ──
export const POST = withRequestLog(async (req: NextRequest) => {
  try {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ZHIPU_API_KEY 未设置。在 .env.local 中添加 ZHIPU_API_KEY 后启用此功能。" },
        { status: 503 },
      );
    }

    const { file, pages: reqPages } = await req.json() as {
      file: string;
      pages?: number[];
    };
    if (!file) return NextResponse.json({ error: "缺少 file 参数" }, { status: 400 });

    const filePath = path.resolve(/* turbopackIgnore: true */ process.cwd(), "public", file.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 读 PDF 并确定要分析的页
    const { PDFDocument } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.load(fs.readFileSync(/* turbopackIgnore: true */ filePath));
    const totalPages = pdfDoc.getPageCount();
    const targetPages = reqPages?.length
      ? reqPages.filter(p => p >= 1 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    if (!targetPages.length) {
      return NextResponse.json({ error: "页码超出范围" }, { status: 400 });
    }

    const pdfBuffer = fs.readFileSync(/* turbopackIgnore: true */ filePath);
    const base64Pdf = pdfBuffer.toString("base64");

    // 逐页分析布局
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

      // 构造多模态消息
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

    return NextResponse.json({
      pages: results,
      source: "glm-ocr",
      model: OCR_MODEL,
    });
  } catch (err) {
    console.error("PDF OCR layout error:", err);
    return NextResponse.json({ error: "布局分析失败" }, { status: 500 });
  }
});
