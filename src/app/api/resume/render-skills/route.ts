/**
 * POST /api/resume/render-skills
 *
 * 根据技能分类数据生成技能区块 HTML（纯模板渲染，<1ms）。
 * Body: { categorizedSkills: Record<string, string[]> }
 */

import { NextRequest } from "next/server";
import { renderSkillsHtml } from "@/lib/skills-html";

export async function POST(request: NextRequest) {
  let body: { categorizedSkills?: Record<string, string[]> };
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

  const html = renderSkillsHtml(body.categorizedSkills);

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
