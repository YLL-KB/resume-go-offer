/**
 * GET /api/analysis/[id]
 * 直接从文件系统读取分析暂存 PDF，兼容生产模式静态文件不更新。
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = rawId.endsWith(".pdf") ? rawId.slice(0, -4) : rawId;
  const pdfPath = path.join(process.cwd(), "public", "uploads", "analysis", `${id}.pdf`);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(pdfPath);
  } catch {
    return NextResponse.json({ error: "分析文件不存在或已过期" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": "inline",
    },
  });
}
