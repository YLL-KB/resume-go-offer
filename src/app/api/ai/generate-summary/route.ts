/**
 * POST /api/ai/generate-summary
 * 根据用户信息生成个人总结（Self-Summary）。
 *
 * Body: { name?: string, title?: string, skills?: string[], highlights?: string[] }
 * Response: { summary: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const profile = await request.json() as {
      name?: string;
      title?: string;
      skills?: string[];
      highlights?: string[];
    };

    const summary = await ai.generateSummary(profile);
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("AI generate summary error:", err);
    return NextResponse.json({ error: "生成失败，请稍后再试" }, { status: 500 });
  }
}
