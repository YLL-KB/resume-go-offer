/**
 * GET /api/templates/[id]/extract-markdown
 * 有 MINERU_TOKEN → Extract 模式（含 bbox contentList）
 * 无 token → Flash 模式（仅 Markdown）
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

    const { MinerU } = await import("mineru-open-sdk");
    const token = process.env["MINERU_TOKEN"];

    // Extract 模式（含 bbox）
    if (token) {
      try {
        const client = new MinerU(token);
        const result = await client.extract(pdfPath);
        return NextResponse.json({
          markdown: result.markdown ?? "",
          contentList: result.contentList ?? null,
          source: "mineru",
        });
      } catch (err) {
        console.warn("MinerU Extract 失败，降级 Flash:", (err as Error).message);
      }
    }

    // Flash 模式（免 token，仅 Markdown）
    try {
      const client = new MinerU();
      const result = await client.flashExtract(pdfPath);
      return NextResponse.json({ markdown: result.markdown ?? "", contentList: null, source: "mineru-flash" });
    } catch { /* fall through */ }

    return NextResponse.json({ markdown: "", contentList: null, source: "none" });
  } catch (err) {
    console.error("提取失败:", err);
    return NextResponse.json({ error: "提取失败" }, { status: 500 });
  }
}
