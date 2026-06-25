/**
 * POST /api/templates/[id]/summary
 * 读取上传的 PDF 模版，用 AI 提取简历标题和内容摘要
 *
 * 输入: 模板 id
 * 输出: { title: string, summary: string }
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { ai } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pdfPath = path.join(
    process.cwd(),
    "public",
    "uploads",
    "templates",
    `${id}.pdf`,
  );

  try {
    await fs.access(pdfPath);
  } catch {
    return NextResponse.json({ error: "模版文件不存在" }, { status: 404 });
  }

  try {
    // 1. 读取 PDF 并提取文本
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfjs = await import("pdfjs-dist");

    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

    const pdf = await pdfjs.getDocument({ data: pdfBuffer.buffer }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texts.push(
        content.items.map((item: unknown) => (item as { str?: string }).str ?? "").join(" "),
      );
    }
    const fullText = texts.join("\n").trim();

    if (fullText.length < 20) {
      // 文本太少，退一步：用文件名当标题
      let name = id;
      try {
        const metaRaw = await fs.readFile(
          path.join(
            process.cwd(),
            "public",
            "uploads",
            "templates",
            `${id}.meta.json`,
          ),
          "utf-8",
        );
        const meta = JSON.parse(metaRaw);
        name = meta.name ?? id;
      } catch {
        // 忽略
      }

      return NextResponse.json({
        title: name,
        summary: "该 PDF 内可提取的文本内容较少，无法自动生成摘要。",
        rawLength: fullText.length,
      });
    }

    // 2. 调 AI 提取标题和摘要
    const res = await fetch(
      `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL ?? "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `你是一位简历信息提取助手。根据以下简历文本，提取出简历的标题和简短摘要。

返回纯 JSON，不要 markdown：
{
  "title": "简历标题，如"张三 · 高级前端工程师" 或文件名即可",
  "summary": "2-3 句话概括：求职者经验年限、核心技能、目标岗位等关键信息"
}

如果文本太短或无法识别，title 返回"未知简历"，summary 返回"无法识别简历内容"。`,
            },
            { role: "user", content: `简历文本：\n${fullText.slice(0, 3000)}` },
          ],
        }),
      },
    ).catch(() => null);

    if (!res || !res.ok) {
      // AI 请求失败，用文件名兜底
      let name = id;
      try {
        const metaRaw = await fs.readFile(
          path.join(
            process.cwd(),
            "public",
            "uploads",
            "templates",
            `${id}.meta.json`,
          ),
          "utf-8",
        );
        const meta = JSON.parse(metaRaw);
        name = meta.name ?? id;
      } catch {
        // 忽略
      }
      return NextResponse.json({
        title: name,
        summary: "AI 分析暂不可用，请稍后再试。",
        rawLength: fullText.length,
      });
    }

    const data = await res.json();
    const reply = (data as any).choices?.[0]?.message?.content ?? "";

    try {
      const parsed = JSON.parse(reply);
      return NextResponse.json({
        title: parsed.title ?? "未知简历",
        summary: parsed.summary ?? "",
        rawLength: fullText.length,
      });
    } catch {
      // 非 JSON 响应，直接返回文本
      return NextResponse.json({
        title: "简历内容",
        summary: reply.slice(0, 200),
        rawLength: fullText.length,
      });
    }
  } catch (err) {
    console.error("Template summary error:", err);
    return NextResponse.json(
      { error: "分析失败，请稍后再试" },
      { status: 500 },
    );
  }
}
