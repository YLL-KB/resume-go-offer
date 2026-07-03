/**
 * GET /api/templates/[id]/extract-markdown
 *
 * PDF 内容提取管线，两层可选：
 *
 * Layer 1 — MinerU（内容提取）
 *   有 MINERU_TOKEN → Extract 模式（Markdown + bbox contentList）
 *   无 token         → Flash 模式（仅 Markdown）
 *
 * Layer 2 — GLM-OCR（布局分析，需 ZHIPU_API_KEY）
 *   在 MinerU 结果之上，用 GLM-OCR 做布局分类（text/table/image）
 *   补充每个元素的结构化类型和更精确的 bbox
 *
 * Query: ?layout=true  启用 GLM-OCR 布局分析
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// ── GLM-OCR 布局分析 ──
async function enrichWithLayout(
  pdfPath: string,
  contentList: Record<string, unknown>[] | null,
): Promise<Record<string, unknown>[] | null> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) return contentList; // 无 key，跳过

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
      // 合并：MinerU contentList 为主，GLM-OCR 补充 type 和 refined bbox
      if (contentList?.length && layoutElements.length) {
        return contentList.map((item, i) => {
          const layout = layoutElements[i] ?? layoutElements.find(
            (el) => Math.abs((el.y as number) - (item.bbox as number[])?.[1] ?? 0) < 20,
          );
          return {
            ...item,
            layoutType: layout?.type ?? "text",
            layoutBbox: layout ? { x: layout.x, y: layout.y, w: layout.w, h: layout.h } : undefined,
          };
        });
      }
      // 没有 contentList，直接用 GLM-OCR 结果
      return layoutElements;
    } catch {
      return contentList;
    }
  } catch (err) {
    console.warn("GLM-OCR layout enrichment failed:", (err as Error).message);
    return contentList;
  }
}

// ── 主路由 ──
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const pdfPath = path.resolve(process.cwd(), "public/uploads/templates", `${id}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
    }

    const url = new URL(req.url);
    const enableLayout = url.searchParams.get("layout") === "true";

    const { MinerU } = await import("mineru-open-sdk");
    const token = process.env["MINERU_TOKEN"];

    let markdown = "";
    let contentList: Record<string, unknown>[] | null = null;
    let source = "none";

    // ── Layer 1: MinerU 提取 ──
    if (token) {
      try {
        const client = new MinerU(token);
        const result = await client.extract(pdfPath);
        markdown = result.markdown ?? "";
        contentList = result.contentList as Record<string, unknown>[] | null;
        source = "mineru";
      } catch (err) {
        console.warn("MinerU Extract 失败，降级 Flash:", (err as Error).message);
      }
    }

    if (!markdown) {
      try {
        const client = new MinerU();
        const result = await client.flashExtract(pdfPath);
        markdown = result.markdown ?? "";
        source = "mineru-flash";
      } catch { /* fall through */ }
    }

    // ── Layer 2: GLM-OCR 布局分析 ──
    let layoutElements: Record<string, unknown>[] | null = null;
    if (enableLayout && markdown) {
      layoutElements = await enrichWithLayout(pdfPath, contentList);
      if (layoutElements) source += "+glm-ocr";
    }

    return NextResponse.json({
      markdown,
      contentList,
      layoutElements: layoutElements ?? undefined,
      source,
    });
  } catch (err) {
    console.error("提取失败:", err);
    return NextResponse.json({ error: "提取失败" }, { status: 500 });
  }
}
