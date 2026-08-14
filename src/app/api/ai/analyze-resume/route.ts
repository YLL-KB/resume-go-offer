/**
 * POST /api/ai/analyze-resume
 * AI 分析简历内容，返回优缺点和改进建议。支持流式。
 *
 * Body: { content: string }
 * Query: ?stream=true  启用流式输出
 */
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { ai, streamToResponse } from "@/lib/ai";

export const POST = withRequestLog(async (request: NextRequest) => {
  try {
    const { content } = await request.json() as { content: string };

    if (!content || typeof content !== "string" || content.trim().length < 50) {
      return NextResponse.json({ error: "简历内容太短，请上传完整的简历文件" }, { status: 400 });
    }

    const url = new URL(request.url);
    if (url.searchParams.get("stream") === "true") {
      const stream = await ai.analyzeResumeStream(content.trim());
      return new Response(streamToResponse(stream), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const cleaned = content.replace(/\\u0000|[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim().slice(0, 4000);
    const analysis = await ai.analyzeResume(cleaned);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("AI analyze error:", err);
    return NextResponse.json({ error: "分析失败，请稍后再试" }, { status: 500 });
  }
});
