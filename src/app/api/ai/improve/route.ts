/**
 * POST /api/ai/improve
 *
 * AI 润色简历经历描述。
 *
 * Body: { text: string, context?: string }
 * Response: { improved: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { text, context } = await request.json() as { text: string; context?: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "请提供需要润色的文本" },
        { status: 400 },
      );
    }

    const improved = await ai.improveText(text.trim(), context);

    return NextResponse.json({ improved });
  } catch (err) {
    console.error("AI improve error:", err);
    return NextResponse.json(
      { error: "润色失败，请稍后再试" },
      { status: 500 },
    );
  }
}
