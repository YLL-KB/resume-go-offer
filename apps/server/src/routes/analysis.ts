/**
 * 分析暂存 PDF 读取路由 — 从文件系统直接返回分析结果 PDF。
 */

import { Hono } from "hono";
import fs from "node:fs/promises";
import path from "node:path";

export const analysisRoutes = new Hono();

// ── GET /api/analysis/:id ──
analysisRoutes.get("/:id", async (c) => {
  const rawId = c.req.param("id");
  const id = rawId.endsWith(".pdf") ? rawId.slice(0, -4) : rawId;
  const pdfPath = path.join(process.cwd(), "public", "uploads", "analysis", `${id}.pdf`);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(pdfPath);
  } catch {
    return c.json({ error: "分析文件不存在或已过期" }, 404);
  }

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": "inline",
    },
  });
});
