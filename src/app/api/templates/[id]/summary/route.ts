/**
 * POST /api/templates/[id]/summary
 * 读取上传的 PDF 模版，用 AI 提取简历标题和内容摘要。
 */
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { ai } from "@/lib/ai";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRequestLog(async (_request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) => {
  const { id } = await params;
  const pdfPath = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "uploads", "templates", `${id}.pdf`);

  try { await fs.access(/* turbopackIgnore: true */ pdfPath); } catch {
    return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
  }

  try {
    const pdfBuffer = await fs.readFile(/* turbopackIgnore: true */ pdfPath);
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "pdf.worker.mjs");

    const pdf = await pdfjs.getDocument({ data: pdfBuffer.buffer }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texts.push(content.items.map((item: unknown) => (item as { str?: string }).str ?? "").join(" "));
    }
    const fullText = texts.join("\n").trim();

    if (fullText.length < 20) {
      let name = id;
      try {
        const metaRaw = await fs.readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ process.cwd(), "public", "uploads", "templates", `${id}.meta.json`), "utf-8");
        name = JSON.parse(metaRaw).name ?? id;
      } catch { /* ignore */ }
      return NextResponse.json({ title: name, summary: "该 PDF 内可提取的文本内容较少，无法自动生成摘要。", rawLength: fullText.length });
    }

    const { title, summary } = await ai.summarizeTemplate(fullText);

    return NextResponse.json({ title, summary, rawLength: fullText.length });
  } catch (err) {
    console.error("Template summary error:", err);
    return NextResponse.json({ error: "分析失败，请稍后再试" }, { status: 500 });
  }
});
