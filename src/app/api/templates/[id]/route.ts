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
  const { id } = await params;
  const { pdf: pdfPath } = filePaths(id);
  const staticUrl = `/uploads/templates/${id}.pdf`;

  try {
    await fs.access(pdfPath);
  } catch {
    return NextResponse.json(
      { error: "模版文件不存在" },
      { status: 404 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  // 预览和下载都 302 → 静态 PDF
  return NextResponse.redirect(
    new URL(staticUrl + (searchParams.get("download") === "1" ? "?download=1" : ""), request.url),
    302,
  );
}

// ── DELETE ──
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { pdf: pdfPath, meta: metaPath } = filePaths(id);

  // ============================================================
  // ⚠️ 管理员权限校验 — 后续接入用户系统后启用
  // ============================================================
  // const { user, isAdmin } = await getAuthContext(request);
  // if (!user || !isAdmin) {
  //   return NextResponse.json({ error: "无权限，仅管理员可删除" }, { status: 403 });
  // }

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
