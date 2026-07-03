/**
 * POST /api/pdf/metadata
 * 获取 PDF 文件的元数据信息。
 *
 * Body: { file: string }  — public/ 下的相对路径
 * Response: { pageCount, pages: [{ width, height }], fileSize, title, author, creator }
 */
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { file } = await req.json() as { file: string };
    if (!file) return NextResponse.json({ error: "缺少 file 参数" }, { status: 400 });

    const filePath = path.resolve(process.cwd(), "public", file.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));

    const pages = pdfDoc.getPages().map((page, i) => {
      const { width, height } = page.getSize();
      return { page: i + 1, width: Math.round(width), height: Math.round(height) };
    });

    return NextResponse.json({
      pageCount: pages.length,
      pages,
      fileSize: stat.size,
      title: pdfDoc.getTitle() ?? undefined,
      author: pdfDoc.getAuthor() ?? undefined,
      creator: pdfDoc.getCreator() ?? undefined,
    });
  } catch (err) {
    console.error("PDF metadata error:", err);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}
