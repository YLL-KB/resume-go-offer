/**
 * POST /api/templates/upload
 * 上传 PDF 模版文件
 * Body: FormData { file: File, name?: string }
 * Response: { id, name, url }
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 允许此路由处理 multipart/form-data
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请上传一个 PDF 文件" }, { status: 400 });
    }

    // 校验类型
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "仅支持 PDF 格式的模版文件" },
        { status: 400 },
      );
    }

    // 限制大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "文件大小不能超过 10MB" },
        { status: 400 },
      );
    }

    // 生成唯一 ID
    const id = crypto.randomUUID();

    // 保存 PDF 文件
    const uploadDir = path.join(process.cwd(), "public", "uploads", "templates");
    await fs.mkdir(uploadDir, { recursive: true });

    const pdfPath = path.join(uploadDir, `${id}.pdf`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(pdfPath, buffer);

    // 保存元数据
    const customName = formData.get("name")?.toString().trim();
    const meta = {
      id,
      name: customName || file.name.replace(/\.pdf$/i, ""),
      fileName: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(uploadDir, `${id}.meta.json`),
      JSON.stringify(meta, null, 2),
    );

    return NextResponse.json(
      {
        id: meta.id,
        name: meta.name,
        url: `/api/templates/${id}`,
        uploadedAt: meta.uploadedAt,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Template upload error:", err);
    return NextResponse.json(
      { error: "上传失败，请稍后再试" },
      { status: 500 },
    );
  }
}
