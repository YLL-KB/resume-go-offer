/**
 * POST /api/resume/render-skills
 *
 * 根据技能分类数据 + 风格，生成技能区块 HTML。
 * 纯模板渲染（<1ms），不再调用 AI。
 * Body: { categorizedSkills: Record<string, string[]>, skillStyle?: "A"|"B"|"D" }
 */

import { NextRequest } from "next/server";
import { renderSkillsHtml, type SkillStyle } from "@/lib/skills-html";

function isSkillStyle(s: string): s is SkillStyle {
  return ["A", "B", "D"].includes(s);
}

export async function POST(request: NextRequest) {
  let body: { categorizedSkills?: Record<string, string[]>; skillStyle?: string };
  try {
    body = await request.json() as typeof body;
    if (!body.categorizedSkills || typeof body.categorizedSkills !== "object") {
      return new Response(JSON.stringify({ error: "categorizedSkills is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const style: SkillStyle = isSkillStyle(body.skillStyle ?? "") ? (body.skillStyle as SkillStyle) : "B";

  const html = renderSkillsHtml(body.categorizedSkills, style);

  // 保持 SSE 格式兼容前端 readRenderSkillsSSE
  const encoder = new TextEncoder();
  const body2 = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", html })}\n\n`));
      ctrl.close();
    },
  });

  return new Response(body2, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
