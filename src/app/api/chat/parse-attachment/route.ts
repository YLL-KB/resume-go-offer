/**
 * POST /api/chat/parse-attachment
 *
 * 解析用户上传的附件：图片（岗位截图）、Word/PDF（简历文件）、链接（招聘 URL）。
 * 返回解析后的结构化文本，前端将其注入对话消息中。
 *
 * Body: FormData
 * - file: File（图片 png/jpg/webp，或文档 pdf/docx/doc）
 * - url: string（招聘链接）
 *
 * Response JSON: { type: "job" | "resume", formatted: "..." }
 */

import { NextRequest, NextResponse } from "next/server";

import { withRequestLog } from "@/lib/logging/request-logger";
export const runtime = "nodejs";

// ── 文件大小限制 ──
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10MB
const MAX_DOC_SIZE = 15 * 1024 * 1024;    // 15MB

// ── 支持的 MIME 类型 ──
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

function fileExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

// ── 从 HTML 中提取纯文本（简易版，去标签）──
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const POST = withRequestLog(async (request: NextRequest) => {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // ── URL 模式 ──
    if (contentType.includes("application/json")) {
      const body = await request.json() as { url?: string };
      const url = body.url?.trim();
      if (!url) {
        return NextResponse.json({ error: "url is required" }, { status: 400 });
      }

      // fetch 网页内容
      let html: string;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ResumeGoOffer/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
      } catch (err) {
        return NextResponse.json(
          { error: `无法访问该链接：${err instanceof Error ? err.message : "网络错误"}` },
          { status: 422 },
        );
      }

      const text = stripHtml(html);
      if (!text || text.length < 50) {
        return NextResponse.json({ error: "未能从该链接提取到有效内容" }, { status: 422 });
      }

      const { parseJobFromText } = await import("@/lib/ai/attachment-parser");
      const parsed = await parseJobFromText(text);

      if (!parsed) {
        return NextResponse.json({ error: "未能从链接内容中识别岗位信息" }, { status: 422 });
      }

      const { formatJobForChat } = await import("@/lib/ai/attachment-parser");
      return NextResponse.json({ type: "job", formatted: formatJobForChat(parsed), raw: parsed });
    }

    // ── 文件模式（multipart/form-data）──
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const fileName = file.name || "unknown";
    const mime = file.type || "";
    const ext = fileExt(fileName);
    const bytes = Buffer.from(await file.arrayBuffer());

    // ── 图片：vision model ──
    const isImage = IMAGE_MIMES.has(mime) || [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
    if (isImage) {
      if (bytes.length > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: "图片文件过大（最大 10MB）" }, { status: 413 });
      }

      const { parseJobFromImage, formatJobForChat } = await import("@/lib/ai/attachment-parser");
      const base64 = bytes.toString("base64");
      const imgMime = mime || "image/png";
      const parsed = await parseJobFromImage(base64, imgMime);

      if (!parsed) {
        return NextResponse.json({ error: "未能从图片中识别岗位信息，请确保图片中包含清晰的招聘信息" }, { status: 422 });
      }

      return NextResponse.json({ type: "job", formatted: formatJobForChat(parsed), raw: parsed });
    }

    // ── Word 文档 ──
    const isWord = mime.includes("wordprocessingml") || mime === "application/msword" || [".docx", ".doc"].includes(ext);
    if (isWord) {
      if (bytes.length > MAX_DOC_SIZE) {
        return NextResponse.json({ error: "文件过大（最大 15MB）" }, { status: 413 });
      }

      // mammoth 将 .docx 转为 HTML，再提取纯文本
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: bytes });
      const text = result.value?.trim();

      if (!text || text.length < 20) {
        return NextResponse.json({ error: "未能从文件中提取到文字内容" }, { status: 422 });
      }

      const { parseResumeFromFile } = await import("@/lib/ai/attachment-parser");
      const summary = await parseResumeFromFile(text);

      return NextResponse.json({
        type: "resume",
        formatted: `[用户上传了简历文件]\n\n${summary ?? text.slice(0, 3000)}`,
        rawText: text.slice(0, 6000),
      });
    }

    // ── PDF ──
    const isPdf = mime === "application/pdf" || ext === ".pdf";
    if (isPdf) {
      if (bytes.length > MAX_DOC_SIZE) {
        return NextResponse.json({ error: "文件过大（最大 15MB）" }, { status: 413 });
      }

      // pdfjs-dist 从 buffer 读取
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

      // 使用 node.js canvas 兼容
      const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;

      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? (item as { str: string }).str : ""))
          .join(" ");
        pages.push(pageText);
      }

      const rawText = pages.join("\n").trim();

      if (!rawText || rawText.length < 20) {
        return NextResponse.json({ error: "未能从 PDF 中提取到文字内容（可能是扫描版 PDF）" }, { status: 422 });
      }

      // 检测 Resume Workshop 格式：base64 编码的 JSON → 解码为可读文本
      const { detectAndParseResumeWorkshop, parseResumeFromFile } = await import("@/lib/ai/attachment-parser");
      const decoded = detectAndParseResumeWorkshop(rawText);
      const text = decoded ?? rawText;

      const summary = await parseResumeFromFile(text);

      return NextResponse.json({
        type: "resume",
        formatted: `[用户上传了简历文件]\n\n${summary ?? text.slice(0, 3000)}`,
        rawText: text.slice(0, 6000),
      });
    }

    return NextResponse.json({ error: "不支持的文件格式，请上传图片（PNG/JPG/WebP）、PDF 或 Word 文档" }, { status: 400 });
  } catch (err) {
    console.error("[parse-attachment] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "服务器错误" },
      { status: 500 },
    );
  }
});
