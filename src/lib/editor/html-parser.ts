import type { TextBlock } from "@/components/preview/ClickablePdfView";

export interface BlockTextData {
  text: string;
  fontSize: number | null;
  textIndent: boolean;
}

/**
 * 将模块内所有 block 拼接为 HTML。
 * 每个 block 的文字包在一个 <p> 里。
 */
export function buildModuleHtml(blocks: TextBlock[]): string {
  return blocks
    .map((b) => {
      const escaped = b.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<p>${escaped}</p>`;
    })
    .join("");
}

/**
 * 从编辑后的 HTML 中提取每个 <p> 的文本和格式。
 * 段落数量必须与 blockCount 一致，否则抛出错误。
 */
export function parseModuleHtml(
  html: string,
  blockCount: number,
): BlockTextData[] {
  // 提取所有 <p> 标签内容
  const pRegex = /<p\b[^>]*>(.*?)<\/p>/gs;
  const matches = [...html.matchAll(pRegex)];

  if (matches.length !== blockCount) {
    throw new Error(
      `段落数量不匹配：期望 ${blockCount} 个，实际 ${matches.length} 个。请勿增删段落。`,
    );
  }

  return matches.map((m) => {
    const inner = m[1];

    // 提取字号
    const fontSizeMatch = inner.match(/font-size:\s*(\d+)px/);
    const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : null;

    // 提取首行缩进
    const textIndent = /text-indent:\s*2em/.test(inner);

    // 提取纯文本
    const text = htmlToPlainText(inner);
    return { text, fontSize, textIndent };
  });
}

function htmlToPlainText(html: string): string {
  if (!html) return "";
  let text = html.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
