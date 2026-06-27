/**
 * POST /api/templates/[id]/fill
 * 将 ResumeData 填充到模版 PDF 上，保存并返回 URL
 */

import { NextRequest, NextResponse } from "next/server";
import { fillPdfTemplate } from "@/lib/pdf/fill";
import fs from "fs";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json() as { data: Record<string, unknown> };

    if (!body.data) {
      return NextResponse.json({ error: "缺少简历数据" }, { status: 400 });
    }

    // 模版 PDF 的本地路径
    const templatePath = path.resolve(process.cwd(), "public/uploads/templates", `${id}.pdf`);

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
    }

    const templateUrl = `/uploads/templates/${id}.pdf`;

    // 填充 PDF
    const { pdfBytes } = await fillPdfTemplate(templateUrl, body.data);

    // 保存到 public/filled/
    const filledDir = path.resolve(process.cwd(), "public/filled");
    if (!fs.existsSync(filledDir)) {
      fs.mkdirSync(filledDir, { recursive: true });
    }
    const filledPath = path.join(filledDir, `${id}.pdf`);
    fs.writeFileSync(filledPath, pdfBytes);

    // 返回访问 URL（加时间戳防缓存）
    const url = `/filled/${id}.pdf?t=${Date.now()}`;

    return NextResponse.json({ url });
  } catch (err) {
    console.error("填充 PDF 失败", err);
    return NextResponse.json({ error: "填充失败" }, { status: 500 });
  }
}
