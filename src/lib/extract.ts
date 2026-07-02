/**
 * PDF 内容提取。
 */
export interface ExtractResult { markdown: string; source: "mineru" | "mineru-flash" | "pdfjs"; }

/** PDF → Markdown（服务端 API，降级 pdfjs） */
async function extractPdf(fileUrl: string, templateId: string): Promise<ExtractResult> {
  try {
    const res = await fetch(`/api/templates/${templateId}/extract-markdown`);
    if (!res.ok) throw new Error("API 提取失败");
    const data = await res.json();
    const json = data as { markdown?: string; source?: string };
    if (json.markdown) return { markdown: json.markdown, source: (json.source as "mineru" | "mineru-flash") ?? "pdfjs" };
    throw new Error("MinerU 返回空");
  } catch {
    const { extractTextBlocks } = await import("@/lib/pdf/text-extractor");
    const blocks = await extractTextBlocks(fileUrl);
    const lines: string[] = [];
    for (const b of blocks) {
      const fs = (b as { fontSize?: number }).fontSize ?? 11; const t = b.text.trim();
      if (!t) continue;
      if (fs >= 18) lines.push(`## ${t}`); else if (fs >= 14) lines.push(`### ${t}`); else lines.push(t);
    }
    return { markdown: lines.join("\n\n"), source: "pdfjs" };
  }
}

export async function extractContent(fileUrl: string, templateId?: string): Promise<ExtractResult> {
  return extractPdf(fileUrl, templateId ?? "");
}
