/**
 * POST /api/ai/improve-resume
 * 根据分析结果中的不足/建议，AI 生成具体的优化方案。
 */

import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { content, type, target } = await request.json() as { content: string; type: "weakness" | "suggestion"; target: string };

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "缺少简历内容" },
        { status: 400 },
      );
    }

    if (!type || !["weakness", "suggestion"].includes(type)) {
      return NextResponse.json(
        { error: "type 必须是 weakness 或 suggestion" },
        { status: 400 },
      );
    }

    if (!target || typeof target !== "string") {
      return NextResponse.json(
        { error: "缺少优化目标描述" },
        { status: 400 },
      );
    }

    const improved = await ai.improveResumeSection(content.trim(), type, target.trim());
    return NextResponse.json({ improved, original: target, type });
  } catch (err) {
    console.error("AI improve error:", err);
    return NextResponse.json(
      { error: "优化失败，请稍后再试" },
      { status: 500 },
    );
  }
}
