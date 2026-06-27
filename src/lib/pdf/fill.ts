import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * 将 ResumeData 填充到模版 PDF 上，返回新 PDF 的二进制数据。
 *
 * 策略：
 * 1. 先用 pdfjs-dist 提取原始 PDF 的文本 + 坐标
 * 2. 用 pdf-lib 在对应位置覆写编辑后的文本
 */

// ── pdfjs 文本提取（运行时动态加载，避免 SSR）──

interface TextBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  page: number;
}

async function extractBlocks(url: string): Promise<TextBlock[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const blocks: TextBlock[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const { height } = page.getViewport({ scale: 1 });

    // 将 items 按行分组（y 坐标相近的归为一行）
    const lineMap = new Map<number, { x: number; y: number; text: string; height: number }[]>();

    for (const item of content.items) {
      const it = item as { str?: string; transform?: number[]; height?: number; width?: number };
      const str = it.str?.trim() ?? "";
      if (!str) continue;

      const tx = it.transform ?? [0, 0, 0, 0, 0, 0];
      const x = tx[4];
      const y = tx[5];
      const h = it.height ?? 10;

      // 按 y 坐标四舍五入到像素级分组
      const yKey = Math.round(y);

      if (!lineMap.has(yKey)) lineMap.set(yKey, []);
      lineMap.get(yKey)!.push({ x, y, text: str, height: h });
    }

    // 每行合并为一个 TextBlock
    for (const [, group] of lineMap) {
      group.sort((a, b) => a.x - b.x);
      const joined = group.map((g) => g.text).join(" ");
      const minX = Math.min(...group.map((g) => g.x));
      const maxY = group[0].y;
      const maxH = Math.max(...group.map((g) => g.height));
      const maxW = Math.max(...group.map((g) => g.x + g.text.length * (g.height * 0.6)));
      blocks.push({
        x: minX,
        y: height - maxY, // pdf-lib uses bottom-left origin, pdfjs uses top-left
        width: maxW - minX + 40,
        height: maxH + 4,
        text: joined,
        page: p,
      });
    }
  }

  return blocks;
}

// ── 将 ResumeData 各模块转为纯文本行 ──

function resumeDataToTextLines(data: Record<string, unknown>): { key: string; lines: string[] }[] {
  const sections: { key: string; lines: string[] }[] = [];

  const basic = data.basic as Record<string, string> | undefined;
  if (basic) {
    const parts = [
      basic.name, basic.title, basic.email, basic.phone, basic.location, basic.website,
    ].filter(Boolean);
    if (parts.length > 0) sections.push({ key: "basic", lines: parts });
  }

  if (data.summary) {
    sections.push({ key: "summary", lines: [data.summary as string] });
  }

  const experience = data.experience as Array<Record<string, string>> | undefined;
  if (experience?.length) {
    const lines: string[] = [];
    for (const exp of experience) {
      if (exp.company || exp.title) lines.push(`${exp.company || ""}  ${exp.title || ""}`.trim());
      if (exp.startDate || exp.endDate) lines.push(`${exp.startDate || ""} - ${exp.endDate || ""}`);
      if (exp.description) lines.push(exp.description);
    }
    if (lines.length > 0) sections.push({ key: "experience", lines });
  }

  const projects = data.projects as Array<Record<string, string>> | undefined;
  if (projects?.length) {
    const lines: string[] = [];
    for (const proj of projects) {
      if (proj.name) lines.push(proj.name);
      if (proj.techStack) lines.push(proj.techStack);
      if (proj.description) lines.push(proj.description);
    }
    if (lines.length > 0) sections.push({ key: "projects", lines });
  }

  const education = data.education as Array<Record<string, string>> | undefined;
  if (education?.length) {
    const lines: string[] = [];
    for (const edu of education) {
      if (edu.school || edu.degree || edu.major) {
        lines.push(`${edu.school || ""}  ${edu.degree || ""}  ${edu.major || ""}`.trim());
      }
      if (edu.startDate || edu.endDate) lines.push(`${edu.startDate || ""} - ${edu.endDate || ""}`);
    }
    if (lines.length > 0) sections.push({ key: "education", lines });
  }

  const skills = data.skills as string[] | undefined;
  if (skills?.length) {
    sections.push({ key: "skills", lines: [skills.join("  ·  ")] });
  }

  return sections;
}

// ── 根据文本相似度匹配 section → text block ──

function matchSectionToBlocks(
  sectionLines: string[],
  blocks: TextBlock[],
): TextBlock[] {
  const matched: TextBlock[] = [];
  for (const line of sectionLines) {
    // 找包含该行关键词的 block
    const words = line.split(/\s+/).filter((w) => w.length > 1);
    for (const block of blocks) {
      if (matched.includes(block)) continue;
      const matchCount = words.filter((w) => block.text.includes(w)).length;
      if (matchCount >= 2 || (words.length === 1 && block.text.includes(words[0]))) {
        matched.push(block);
        break;
      }
    }
  }
  return matched;
}

// ── 主函数：填充 PDF ──

export interface FillResult {
  pdfBytes: Uint8Array;
  pageCount: number;
}

export async function fillPdfTemplate(
  templateUrl: string,
  resumeData: Record<string, unknown>,
): Promise<FillResult> {
  // 1) 提取原始 PDF 文本块 + 坐标
  const blocks = await extractBlocks(templateUrl);

  // 2) 将 ResumeData 转为文本行
  const sections = resumeDataToTextLines(resumeData);

  // 3) 加载原始 PDF
  const existingBytes = await fetch(templateUrl).then((r) => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(existingBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 4) 逐 section 匹配并覆写
  for (const section of sections) {
    const matched = matchSectionToBlocks(section.lines, blocks);

    for (let i = 0; i < section.lines.length; i++) {
      const line = section.lines[i];
      const block = matched[i];
      if (!block || block.page < 1 || block.page > pages.length) continue;

      const page = pages[block.page - 1];
      const fontSize = Math.min(block.height - 2, 11);

      // 覆盖原有文本区域
      page.drawRectangle({
        x: block.x - 2,
        y: block.y - 2,
        width: block.width + 4,
        height: block.height + 4,
        color: rgb(1, 1, 1),
      });

      // 绘制新文本
      page.drawText(line, {
        x: block.x,
        y: block.y + 1,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: block.width > 100 ? block.width : 500,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, pageCount: pages.length };
}
