import type { TextBlock } from "@/components/preview/ClickablePdfView";

export interface BlockTextData {
  text: string;
  fontSize: number | null;
  textIndent: boolean;
  color: string | null;
  fontFamily: string | null;
  width: number | null;
  height: number | null;
}

/**
 * 将模块内所有 block 拼接为 HTML。
 * 每个 block 的文字包在一个 <p> 里，附带字体、颜色、缩进信息。
 */
export function buildModuleHtml(blocks: TextBlock[]): string {
  return blocks
    .map((b) => {
      const escaped = b.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // 附带原始 block 的字体/颜色信息
      const blockWithMeta = b as TextBlock & {
        fontSize?: number;
        fontName?: string;
        color?: string;
      };
      const fontSize = blockWithMeta.fontSize;
      const fontName = blockWithMeta.fontName;
      const color = blockWithMeta.color;

      const styles: string[] = [];
      if (fontSize) styles.push(`font-size:${fontSize}px`);
      if (fontName) styles.push(`font-family:${fontName}`);
      if (color) styles.push(`color:${color}`);

      const styleAttr = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
      return `<p${styleAttr}>${escaped}</p>`;
    })
    .join("");
}

/**
 * 从编辑后的 HTML 中提取文本和格式，映射回各个 block。
 *
 * 理想情况下段落数与 block 数一致，直接一一映射；
 * 不一致时（用户增删了段落），将全文按字符数均分到各 block。
 */
export function parseModuleHtml(
  html: string,
  blockCount: number,
): BlockTextData[] {
  const pRegex = /<p\b[^>]*>(.*?)<\/p>/gs;
  const matches = [...html.matchAll(pRegex)];

  // 提取默认格式（取全文的第一个字号/颜色/字体/缩进设置）
  const fontSizeMatch = html.match(/font-size:\s*(\d+)px/);
  const defaultFontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : null;

  const colorMatch = html.match(/color:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/);
  const defaultColor = colorMatch ? colorMatch[1] : null;

  const fontMatch = html.match(/font-family:\s*([^;"]+)/);
  const defaultFontFamily = fontMatch ? fontMatch[1].trim() : null;

  const defaultIndent = /text-indent:\s*2em/.test(html);

  // ── 段落数匹配：一一对应 ──
  if (matches.length === blockCount) {
    return matches.map((m) => {
      const inner = m[1];
      const fm = inner.match(/font-size:\s*(\d+)px/);
      const cm = inner.match(/color:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/);
      const ffm = inner.match(/font-family:\s*([^;"]+)/);
      return {
        text: htmlToPlainText(inner),
        fontSize: fm ? Number(fm[1]) : defaultFontSize,
        textIndent: /text-indent:\s*2em/.test(inner) || defaultIndent,
        color: cm ? cm[1] : defaultColor,
        fontFamily: ffm ? ffm[1].trim() : defaultFontFamily,
        width: null,
        height: null,
      };
    });
  }

  // ── 段落数不匹配：均分全文 ──
  const fullText = htmlToPlainText(html);
  if (!fullText) {
    return Array.from({ length: blockCount }, () => ({
      text: "",
      fontSize: defaultFontSize,
      textIndent: defaultIndent,
      color: defaultColor,
      fontFamily: defaultFontFamily,
      width: null,
      height: null,
    }));
  }

  const totalChars = fullText.length;
  const charsPerBlock = Math.max(1, Math.ceil(totalChars / blockCount));

  return Array.from({ length: blockCount }, (_, i) => {
    const start = i * charsPerBlock;
    const end = Math.min(start + charsPerBlock, totalChars);
    let chunk = fullText.slice(start, end).trim();

    // 尝试在合适的位置截断（换行或空格）
    if (i < blockCount - 1 && end < totalChars) {
      const lookBack = Math.min(20, chunk.length);
      const breakPos = Math.max(
        chunk.lastIndexOf("\n", chunk.length - lookBack),
        chunk.lastIndexOf(" ", chunk.length - lookBack),
      );
      if (breakPos > chunk.length / 2) {
        chunk = chunk.slice(0, breakPos).trim();
      }
    }

    return {
      text: chunk,
      fontSize: defaultFontSize,
      textIndent: defaultIndent,
      color: defaultColor,
      fontFamily: defaultFontFamily,
      width: null,
      height: null,
    };
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

/** PDF 字体名 → CSS font-family 映射 */
export function mapPdfFontToCss(fontName: string): string {
  const lower = fontName.toLowerCase();
  if (lower.includes("times")) return "serif";
  if (lower.includes("helvetica")) return "sans-serif";
  if (lower.includes("simsun") || lower.includes("song") || lower.includes("宋"))
    return '"SimSun", "宋体", serif';
  if (lower.includes("simhei") || lower.includes("hei") || lower.includes("microsoft yahei") || lower.includes("黑"))
    return '"Microsoft YaHei", "黑体", sans-serif';
  if (lower.includes("kai") || lower.includes("楷"))
    return '"KaiTi", "楷体", serif';
  if (lower.includes("fang") || lower.includes("仿"))
    return '"FangSong", "仿宋", serif';
  if (lower.includes("arial")) return "Arial, sans-serif";
  if (lower.includes("courier")) return '"Courier New", monospace';
  return "sans-serif";
}

/** RGB 数组 [r,g,b] (0-1) → hex 字符串 */
export function rgbToHex(rgb: number[]): string {
  if (!rgb || rgb.length < 3) return "#000000";
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
