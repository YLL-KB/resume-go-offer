/**
 * PDF 内容提取器。
 * 通过服务端 API 调用 MinerU（避免客户端 bundling Node.js fs 模块）。
 * MinerU 不可用时降级到 pdfjs-dist 本地提取。
 */

import type { RichTextBlock } from "@/lib/pdf/text-extractor";

export interface ExtractionResult {
  markdown: string;
  source: "mineru" | "pdfjs";
}

/**
 * 通过服务端 API 调用 MinerU 提取 Markdown。
 */
async function extractViaApi(templateId: string): Promise<ExtractionResult> {
  const res = await fetch(`/api/templates/${templateId}/extract-markdown`);
  if (!res.ok) throw new Error("API 提取失败");
  return res.json();
}

/**
 * 降级方案：用 pdfjs-dist 提取文本块，转为简易 Markdown。
 */
async function extractWithPdfJs(pdfUrl: string): Promise<string> {
  const { extractTextBlocks } = await import("@/lib/pdf/text-extractor");
  const blocks: RichTextBlock[] = await extractTextBlocks(pdfUrl);

  const lines: string[] = [];
  let prevPage = 0;

  for (const block of blocks) {
    if (block.page !== prevPage && prevPage > 0) lines.push("\n---\n");
    prevPage = block.page;

    const fontSize = block.fontSize ?? 11;
    const text = block.text.trim();
    if (!text) continue;

    if (fontSize >= 18) lines.push(`## ${text}`);
    else if (fontSize >= 14) lines.push(`### ${text}`);
    else if (/^\d+[\.\)、]/.test(text) || /^[一二三四五六七八九十]+[、]/.test(text))
      lines.push(`- ${text}`);
    else lines.push(text);
  }

  return lines.join("\n\n");
}

/**
 * 提取 PDF 的 Markdown 内容。
 * 尝试服务端 MinerU → 失败则降级到 pdfjs-dist。
 */
export async function extractMarkdown(
  pdfUrl: string,
  templateId: string,
): Promise<ExtractionResult> {
  try {
    const result = await extractViaApi(templateId);
    if (result.markdown) return result;
    throw new Error("MinerU 返回空内容");
  } catch (err) {
    console.warn("MinerU 提取失败，降级到 pdfjs-dist:", (err as Error).message);
    const markdown = await extractWithPdfJs(pdfUrl);
    return { markdown, source: "pdfjs" };
  }
}

export interface MdModule {
  id: string;
  label: string;
  content: string;
}

/** 将 Markdown 按 ## 标题拆分为模块 */
export function parseMarkdownModules(markdown: string): MdModule[] {
  const modules: MdModule[] = [];
  const sections = markdown.split(/(?=^## )/m);

  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    const firstLine = trimmed.split("\n")[0];
    const label = firstLine.replace(/^#+\s*/, "").trim().slice(0, 20) || "模块";
    modules.push({ id: `md-${modules.length}`, label, content: trimmed });
  }

  if (modules.length === 0 && markdown.trim()) {
    modules.push({ id: "md-0", label: "全文", content: markdown.trim() });
  }

  return modules;
}
