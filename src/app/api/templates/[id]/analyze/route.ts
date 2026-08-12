/**
 * POST /api/templates/[id]/analyze
 * 读取 PDF 模版文字，用 AI 识别模块结构。
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
  const pdfPath = path.join(process.cwd(), "public", "uploads", "templates", `${id}.pdf`);

  try { await fs.access(pdfPath); } catch {
    return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
  }

  try {
    // 从 PDF raw text 中提取中文内容
    const buffer = await fs.readFile(pdfPath);
    const raw = buffer.toString("utf-8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
    const textMatches = raw.match(/\(([^)]*)\)/g) || [];
    const chunks = textMatches
      .map(m => m.slice(1, -1))
      .filter(t => t.length > 2 && /[一-鿿]/.test(t) && !t.includes("\\"));
    const text = chunks.join("\n").trim();

    if (text.length < 30) {
      return NextResponse.json({
        layout: "single-column",
        sections: [
          { id: "basic", label: "个人信息", order: 0, type: "header", description: "姓名、联系方式等基本信息" },
          { id: "experience", label: "工作经历", order: 1, type: "experience", description: "过往工作经历" },
          { id: "education", label: "教育背景", order: 2, type: "education", description: "学历信息" },
          { id: "skills", label: "技能", order: 3, type: "skills", description: "专业技能列表" },
        ],
        style_hints: { has_photo_area: false, section_separator: "line" },
        warning: "PDF 文本提取有限，使用默认结构",
      });
    }

    const analysis = await ai.analyzeTemplate(text);

    // 缓存到 meta.json
    const metaPath = path.join(process.cwd(), "public", "uploads", "templates", `${id}.meta.json`);
    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      meta.analysis = analysis;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* 写不进去就算了 */ }

    return NextResponse.json({ ...analysis, cached: false });
  } catch (err) {
    console.error("Template analysis error:", err);
    return NextResponse.json({ error: "分析失败", detail: String(err) }, { status: 500 });
  }
});
