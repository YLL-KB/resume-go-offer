/**
 * GET /api/templates/[id]/extract-markdown
 * 服务端调用 MinerU 提取 PDF 的 Markdown。
 * SDK 支持本地文件上传（flashSubmitFile），不需要公网 URL。
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const pdfPath = path.resolve(process.cwd(), "public/uploads/templates", `${id}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
    }

    // MinerU flashExtract 支持本地文件路径（SDK 自动走 upload 通道）
    try {
      const { MinerU } = await import("mineru-open-sdk");
      const client = new MinerU();
      // 传本地绝对路径，SDK 内部用 flashSubmitFile 上传
      const result = await client.flashExtract(pdfPath);
      if (result.markdown) {
        return NextResponse.json({ markdown: result.markdown, source: "mineru" });
      }
    } catch (mineruErr) {
      console.warn("MinerU 提取失败:", (mineruErr as Error).message);
    }

    return NextResponse.json({ markdown: "", source: "pdfjs" });
  } catch (err) {
    console.error("提取失败:", err);
    return NextResponse.json({ error: "提取失败" }, { status: 500 });
  }
}
