/**
 * POST /api/ai/analyze-resume
 * AI 分析简历内容，返回优缺点和改进建议。
 */

import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json() as { content: string };

    if (!content || typeof content !== "string" || content.trim().length < 50) {
      return NextResponse.json(
        { error: "简历内容太短，请上传完整的简历文件" },
        { status: 400 },
      );
    }

    const analysis = await ai.analyzeResume(content.trim());
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("AI analyze error:", err);
    return NextResponse.json(
      { error: "分析失败，请稍后再试" },
      { status: 500 },
    );
  }
}
