/**
 * POST /api/ai/upload-resume
 * 暂存简历文件用于 AI 分析，独立于模版库，自动清理 30min 旧文件。
 *
 * Body: FormData { file: File }
 * Response: { id: string, url: string }
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "analysis");
const MAX_AGE_MS = 30 * 60 * 1000; // 30 分钟自动清理

// 清理过期文件（每次上传时触发）
async function cleanup() {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    const now = Date.now();
    for (const f of files) {
      const p = path.join(UPLOAD_DIR, f);
      try {
        const stat = await fs.stat(p);
        if (now - stat.mtimeMs > MAX_AGE_MS) await fs.unlink(p);
      } catch { /* skip */ }
    }
  } catch { /* dir 不存在 */ }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传一个 PDF 文件" }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "仅支持 PDF 格式" }, { status: 400 });
    }

    // 确保目录存在
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    // 清理旧文件
    void cleanup();

    // 保存
    const id = crypto.randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(UPLOAD_DIR, `${id}.pdf`), buf);

    return NextResponse.json({ id, url: `/uploads/analysis/${id}.pdf` });
  } catch (err) {
    console.error("Upload resume error:", err);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
