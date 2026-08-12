/**
 * GET /api/templates
 * 返回所有用户上传的模版
 */

import { NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestLog(async () => {
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
            layout: meta.layout ?? "classic",
          });
        } catch {
          // 跳过损坏的元数据
        }
      }
    } catch {
      // uploadDir 不存在，返回空列表
    }

    // 排序：内置模版在前，上传模版按时间倒序（最新在前）
    uploaded.sort((a, b) => {
      const aBuiltIn = a.builtIn as boolean;
      const bBuiltIn = b.builtIn as boolean;
      if (aBuiltIn && !bBuiltIn) return -1;
      if (!aBuiltIn && bBuiltIn) return 1;
      const ta = a.uploadedAt ? new Date(a.uploadedAt as string).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt as string).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json(uploaded);
  } catch (err) {
    console.error("Templates list error:", err);
    return NextResponse.json([]);
  }
});
