/**
 * GET /api/templates
 * 返回所有用户上传的模版
 */

import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "templates");
    const uploaded: Record<string, unknown>[] = [];

    try {
      await fs.access(uploadDir);
      const files = await fs.readdir(uploadDir);
      const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

      for (const mf of metaFiles) {
        try {
          const raw = await fs.readFile(path.join(uploadDir, mf), "utf-8");
          const meta = JSON.parse(raw);
          uploaded.push({
            id: meta.id,
            name: meta.name,
            desc: `自定义上传 — ${meta.fileName ?? ""}`,
            url: `/api/templates/${meta.id}`,
            builtIn: false,
            uploadedAt: meta.uploadedAt,
          });
        } catch {
          // 跳过损坏的元数据
        }
      }
    } catch {
      // uploadDir 不存在，返回空列表
    }

    return NextResponse.json(uploaded);
  } catch (err) {
    console.error("Templates list error:", err);
    return NextResponse.json([]);
  }
}
