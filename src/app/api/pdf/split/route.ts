/**
 * POST /api/pdf/split
 * 从 PDF 中提取指定页面。
 *
 * Body: { file: string, pages: number[] | string }
 *   file: public/ 下的相对路径
 *   pages: 要提取的页码（1-indexed），如 [1, 3, 5] 或 "1-3,5"
 * Response: { url: string | string[] }
 *   提取单页 → url；提取多页 → urls[]
 */
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

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

export const POST = withRequestLog(async (req: NextRequest) => {
  try {
    const { file, pages } = await req.json() as { file: string; pages: number[] | string };
    if (!file) return NextResponse.json({ error: "缺少 file 参数" }, { status: 400 });
    if (!pages) return NextResponse.json({ error: "缺少 pages 参数" }, { status: 400 });

    const filePath = path.resolve(process.cwd(), "public", file.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const srcDoc = await PDFDocument.load(fs.readFileSync(filePath));
    const totalPages = srcDoc.getPageCount();
    const pageNums = parsePages(pages, totalPages);

    if (!pageNums.length) {
      return NextResponse.json({ error: "页码超出范围" }, { status: 400 });
    }

    const outDir = path.resolve(process.cwd(), "public/split");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // 每组连续页码合为一个 PDF
    const urls: string[] = [];
    const indices = pageNums.map(p => p - 1); // 0-indexed

    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, indices);
    for (const page of copied) newDoc.addPage(page);

    const outName = `split-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(outDir, outName), await newDoc.save());
    urls.push(`/split/${outName}`);

    return NextResponse.json(urls.length === 1 ? { url: urls[0] } : { urls });
  } catch (err) {
    console.error("PDF split error:", err);
    return NextResponse.json({ error: "拆分失败" }, { status: 500 });
  }
});
