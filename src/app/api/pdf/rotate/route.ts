/**
 * POST /api/pdf/rotate
 * 旋转 PDF 页面。
 *
 * Body: { file: string, pages?: number[], angle: 90 | 180 | 270 }
 *   file: public/ 下的相对路径
 *   pages: 要旋转的页码（1-indexed），默认全部页
 *   angle: 旋转角度（顺时针度数）
 * Response: { url: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const VALID_ANGLES = [90, 180, 270];

export async function POST(req: NextRequest) {
  try {
    const { file, pages, angle } = await req.json() as {
      file: string;
      pages?: number[];
      angle: number;
    };

    if (!file) return NextResponse.json({ error: "缺少 file 参数" }, { status: 400 });
    if (!angle || !VALID_ANGLES.includes(angle)) {
      return NextResponse.json({ error: "angle 必须是 90、180 或 270" }, { status: 400 });
    }

    const filePath = path.resolve(process.cwd(), "public", file.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));
    const totalPages = pdfDoc.getPageCount();

    // 确定要旋转的页
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

    return NextResponse.json({ url: `/rotated/${outName}` });
  } catch (err) {
    console.error("PDF rotate error:", err);
    return NextResponse.json({ error: "旋转失败" }, { status: 500 });
  }
}
