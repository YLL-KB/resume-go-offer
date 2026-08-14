/**
 * POST /api/ai/improve
 * AI 润色简历经历描述。支持普通响应和流式输出。
 *
 * Body: { text: string, context?: string }
 * Query: ?stream=true  启用 SSE 流式输出
 * Response: { improved: string }  或  text/plain 流
 */
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { ai, streamToResponse } from "@/lib/ai";

export const POST = withRequestLog(async (request: NextRequest) => {
  try {
    const { text, context } = await request.json() as { text: string; context?: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "请提供需要润色的文本" }, { status: 400 });
    }

    const url = new URL(request.url);
    if (url.searchParams.get("stream") === "true") {
      const stream = await ai.improveTextStream(text.trim(), context);
      return new Response(streamToResponse(stream), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const improved = await ai.improveText(text.trim(), context);
    return NextResponse.json({ improved });
  } catch (err) {
    console.error("AI improve error:", err);
    return NextResponse.json({ error: "润色失败，请稍后再试" }, { status: 500 });
  }
});
