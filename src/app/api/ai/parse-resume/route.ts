/**
 * POST /api/ai/parse-resume
 * 将简历文本解析为结构化字段，用于表单编辑
 */

import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json() as { content: string };

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "缺少简历内容" }, { status: 400 });
    }

    const parsed = await ai.parseResume(content.trim());
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("AI parse error:", err);
    return NextResponse.json(
      { error: "解析失败，请稍后再试" },
      { status: 500 },
    );
  }
}
