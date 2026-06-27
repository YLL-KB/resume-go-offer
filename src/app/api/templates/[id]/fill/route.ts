/**
 * POST /api/templates/[id]/fill
 * 将客户端编辑后的文本块逐块渲染到模版 PDF 上，保存并返回 URL
 */

import { NextRequest, NextResponse } from "next/server";
import { fillPdfTemplate } from "@/lib/pdf/fill";
import type { PdfTextBlock } from "@/lib/pdf/fill";
import fs from "fs";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json() as { blocks: PdfTextBlock[] };

    if (!body.blocks || !Array.isArray(body.blocks) || body.blocks.length === 0) {
      return NextResponse.json({ error: "缺少 PDF 文本块数据" }, { status: 400 });
    }

    const templatePath = path.resolve(process.cwd(), "public/uploads/templates", `${id}.pdf`);

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
    }

    const templateBytes = fs.readFileSync(templatePath).buffer;

    const { pdfBytes } = await fillPdfTemplate(templateBytes, body.blocks);

    const filledDir = path.resolve(process.cwd(), "public/filled");
    if (!fs.existsSync(filledDir)) {
      fs.mkdirSync(filledDir, { recursive: true });
    }
    const filledPath = path.join(filledDir, `${id}.pdf`);
    fs.writeFileSync(filledPath, pdfBytes);

    const url = `/filled/${id}.pdf?t=${Date.now()}`;

    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("填充 PDF 失败:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
