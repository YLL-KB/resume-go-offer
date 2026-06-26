/**
 * POST /api/templates/[id]/analyze
 *
 * 读取 PDF 模版的文字内容，用 AI 识别其中的模块结构。
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pdfPath = path.join(process.cwd(), "public", "uploads", "templates", `${id}.pdf`);

  try {
    await fs.access(pdfPath);
  } catch {
    return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
  }

  try {
    // 读取 raw PDF，尝试从中提取纯文本（不依赖 pdfjs-dist）
    const buffer = await fs.readFile(pdfPath);
    const raw = buffer.toString("utf-8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");

    // PDF 标准中，文本通常出现在 BT...ET 之间或括号内
    const textMatches = raw.match(/\(([^)]*)\)/g) || [];
    const chunks = textMatches
      .map((m) => m.slice(1, -1))
      .filter((t) => t.length > 2 && /[\u4e00-\u9fff]/.test(t) && !t.includes("\\"));
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

    // 调 AI
    const systemPrompt = `你是一个简历模板分析专家。分析下面的简历模板文字内容，识别出它包含哪些模块/部分。

返回纯 JSON（不要 markdown 包裹）：
{
  "layout": "single-column",
  "sections": [
    {
      "id": "唯一标识符",
      "label": "中文模块名称",
      "order": 0,
      "type": "header | summary | experience | education | projects | skills | certificates | custom",
      "description": "1-2句说明"
    }
  ],
  "style_hints": {
    "has_photo_area": false,
    "section_separator": "line"
  }
}`;

    const res = await fetch(
      `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL ?? "deepseek-chat",
          temperature: 0.1,
          max_tokens: 2000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `分析以下简历模板的文字内容，识别模块结构：\n\n${text.slice(0, 4000)}` },
          ],
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI API 请求失败: ${res.status} ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回内容为空");

    // 提取 JSON
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : { layout: "single-column", sections: [] };
    }

    // 确保必填字段
    const analysis = {
      layout: (result.layout as string) ?? "single-column",
      sections: Array.isArray(result.sections) ? result.sections : [],
      style_hints: (result.style_hints as Record<string, unknown>) ?? {
        has_photo_area: false,
        section_separator: "line",
      },
    };

    // 缓存到 meta
    const metaPath = path.join(process.cwd(), "public", "uploads", "templates", `${id}.meta.json`);
    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      meta.analysis = analysis;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch {
      // 写不进去就算了
    }

    return NextResponse.json({ ...analysis, cached: false });
  } catch (err) {
    console.error("Template analysis error:", err);
    return NextResponse.json(
      { error: "分析失败", detail: String(err) },
      { status: 500 },
    );
  }
}
