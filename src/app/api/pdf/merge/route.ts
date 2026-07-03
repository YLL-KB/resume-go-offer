/**
 * POST /api/pdf/merge
 * 合并多个 PDF 文件为一个。
 *
 * Body: { files: string[] }  — files 为 public/ 下的相对路径数组
 * Response: { url: string }   — 合并后的 PDF 下载地址
 */
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { files } = await req.json() as { files: string[] };
    if (!files?.length || files.length < 2) {
      return NextResponse.json({ error: "至少需要2个PDF文件" }, { status: 400 });
    }

    const mergedDoc = await PDFDocument.create();

    for (const file of files) {
      const filePath = path.resolve(process.cwd(), "public", file.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: `文件不存在: ${file}` }, { status: 404 });
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
    const outPath = path.join(outDir, outName);
    fs.writeFileSync(outPath, mergedBytes);

    return NextResponse.json({ url: `/merged/${outName}` });
  } catch (err) {
    console.error("PDF merge error:", err);
    return NextResponse.json({ error: "合并失败" }, { status: 500 });
  }
}
