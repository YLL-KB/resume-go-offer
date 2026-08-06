/**
 * GET /api/templates/[id] — 预览或下载 PDF 模版
 * DELETE /api/templates/[id] — 删除上传的模版（预留管理员权限校验）
 *
 * 不带 ?download=1 → 302 重定向到静态 PDF（浏览器内联预览）
 * 带 ?download=1  → 302 重定向到静态 PDF
 *
 * 文件存储在 public/uploads/templates/{id}.pdf，
 * Next.js 自动将其作为静态资源托管在 /uploads/templates/{id}.pdf。
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuthUserId } from "@/lib/auth/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── 工具：拼接文件路径 ──
function filePaths(id: string) {
  const dir = path.join(process.cwd(), "public", "uploads", "templates");
  return {
    dir,
    pdf: path.join(dir, `${id}.pdf`),
    meta: path.join(dir, `${id}.meta.json`),
  };
}

// ── GET ──
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = rawId.endsWith(".pdf") ? rawId.slice(0, -4) : rawId;
  const { pdf: pdfPath } = filePaths(id);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(pdfPath);
  } catch {
    return NextResponse.json(
      { error: "模版文件不存在" },
      { status: 404 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const isDownload = searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=3600",
      ...(isDownload
        ? { "Content-Disposition": `attachment; filename="${id}.pdf"` }
        : { "Content-Disposition": "inline" }),
    },
  });
}

// ── DELETE ──
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = rawId.endsWith(".pdf") ? rawId.slice(0, -4) : rawId;
  const { pdf: pdfPath, meta: metaPath } = filePaths(id);

  // ── 权限校验 ──
  const { userId, isAnonymous } = await getAuthUserId(request);
  if (isAnonymous) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  // 检查上传者（若 meta 中无 uploadedBy 则兼容旧数据，仅拒绝明确不匹配的）
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(raw);
    if (meta.uploadedBy && meta.uploadedBy !== userId) {
      return NextResponse.json({ error: "无权删除此模版" }, { status: 403 });
    }
  } catch {
    // meta 不存在 → 后面会返回 404
  }

  // 只允许删除用户上传的模版（内置模版不可删除）
  const builtInIds = ["classic", "modern", "minimal"];
  if (builtInIds.includes(id)) {
    return NextResponse.json(
      { error: "内置模版不可删除" },
      { status: 403 },
    );
  }

  // 检查文件是否存在
  let metaExists = false;
  try {
    await fs.access(metaPath);
    metaExists = true;
  } catch {
    // meta 不存在
  }

  if (!metaExists) {
    return NextResponse.json({ error: "模版不存在" }, { status: 404 });
  }

  // 删除文件
  const errors: string[] = [];
  for (const p of [pdfPath, metaPath]) {
    try {
      await fs.unlink(p);
    } catch {
      errors.push(p);
    }
  }

  if (errors.length > 0) {
    console.error("Template delete partial error:", errors);
    return NextResponse.json(
      { error: "部分文件删除失败" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id });
}
