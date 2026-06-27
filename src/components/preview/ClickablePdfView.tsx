"use client";

import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ── 文本块（PDF 坐标系，bottom-left origin）──
export interface TextBlock {
  x: number;
  y: number; // PDF y (bottom-left origin)
  width: number;
  height: number;
  text: string;
  page: number;
  globalIndex: number;
  pageHeight: number; // viewport height for screen conversion
}

interface ClickablePdfViewProps {
  url: string;
  activeBlockIndices: Set<number>;
  onBlockClick: (block: TextBlock, index: number) => void;
  onBlocksExtracted?: (blocks: TextBlock[]) => void;
}

// ── 从 PDF 提取文本块（PDF 坐标系）──
async function extractBlocks(url: string): Promise<TextBlock[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const blocks: TextBlock[] = [];
  let globalIndex = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    // 按 PDF 原始 y 坐标分组（bottom-left origin）
    const lineMap = new Map<
      number,
      { minX: number; pdfY: number; maxH: number; maxW: number; words: string[] }
    >();

    for (const item of content.items) {
      const it = item as {
        str?: string;
        transform?: number[];
        height?: number;
        width?: number;
      };
      const str = it.str?.trim() ?? "";
      if (!str) continue;

      const tx = it.transform ?? [0, 0, 0, 0, 0, 0];
      const x = tx[4];
      const pdfY = tx[5];
      const charH = it.height ?? 10;
      const charW = it.width ?? str.length * charH * 0.55;
      const yKey = Math.round(pdfY);

      if (!lineMap.has(yKey)) {
        lineMap.set(yKey, { minX: x, pdfY, maxH: charH, maxW: x + charW, words: [] });
      }
      const line = lineMap.get(yKey)!;
      line.minX = Math.min(line.minX, x);
      line.maxH = Math.max(line.maxH, charH);
      line.maxW = Math.max(line.maxW, x + charW);
      line.words.push(str);
    }

    // 按 y 从大到小排序（PDF 坐标，上大下小）
    const sorted = [...lineMap.entries()].sort((a, b) => b[0] - a[0]);

    for (const [, line] of sorted) {
      blocks.push({
        x: line.minX,
        y: line.pdfY,
        width: line.maxW - line.minX + 16,
        height: line.maxH + 6,
        text: line.words.join(" "),
        page: p,
        globalIndex: globalIndex++,
        pageHeight: viewport.height,
      });
    }
  }

  return blocks;
}

// ── PDF y → screen y ──
function toScreenY(pdfY: number, blockHeight: number, pageHeight: number): number {
  return pageHeight - pdfY - blockHeight;
}

// ── 单页 + 浮层 ──
function PageWithOverlays({
  pageNumber,
  width,
  blocks,
  activeBlockIndices,
  onBlockClick,
}: {
  pageNumber: number;
  width: number;
  blocks: TextBlock[];
  activeBlockIndices: Set<number>;
  onBlockClick: (block: TextBlock, index: number) => void;
}) {
  const [scale, setScale] = useState(1);
  const [pageH, setPageH] = useState(0);

  const onLoad = useCallback(
    (p: { originalWidth: number; originalHeight: number }) => {
      setScale(width / p.originalWidth);
      setPageH(p.originalHeight * (width / p.originalWidth));
    },
    [width],
  );

  return (
    <div className="relative" style={{ width, height: pageH || "auto" }}>
      <Page
        pageNumber={pageNumber}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        onLoadSuccess={onLoad}
      />

      {/* 可点击区块 */}
      {blocks.map((block) => {
        if (!block.pageHeight || !scale) return null;
        const left = block.x * scale;
        const screenY = toScreenY(block.y, block.height, block.pageHeight);
        const top = screenY * scale;
        if (Number.isNaN(left) || Number.isNaN(top)) return null;
        const w = Math.max(block.width * scale, 40);
        const h = Math.max(block.height * scale, 12);
        const isActive = activeBlockIndices.has(block.globalIndex);

        return (
          <button
            key={block.globalIndex}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBlockClick(block, block.globalIndex);
            }}
            className={cn(
              "absolute z-10 text-left transition-colors cursor-pointer border border-dashed rounded-sm",
              isActive
                ? "bg-primary/20 border-primary"
                : "border-muted-foreground/15 hover:bg-amber-500/15 hover:border-amber-400",
            )}
            style={{ left, top, width: w, height: h }}
            title={block.text.slice(0, 80)}
          />
        );
      })}
    </div>
  );
}

// ── 主组件 ──
export function ClickablePdfView({
  url,
  activeBlockIndices,
  onBlockClick,
  onBlocksExtracted,
}: ClickablePdfViewProps) {
  const [numPages, setNumPages] = useState(0);
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setBlocks([]);
      try {
        const result = await extractBlocks(url);
        if (!cancelled) {
          setBlocks(result);
          onBlocksExtracted?.(result);
        }
      } catch (err) {
        console.error("提取文本块失败:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageBlocks = useCallback(
    (pageNum: number) => blocks.filter((b) => b.page === pageNum),
    [blocks],
  );

  return (
    <div className="flex flex-col items-center w-full">
      {(loading) && (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          识别可编辑区域...
        </div>
      )}

      <div className="w-full max-w-[210mm] origin-top scale-[0.58] md:scale-90 md:origin-top-left">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              加载模版...
            </div>
          }
          error={
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              PDF 加载失败
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={`page-${i + 1}`}
              className="bg-white shadow-lg mx-auto mb-4 last:mb-0"
              style={{ width: "210mm" }}
            >
              <PageWithOverlays
                pageNumber={i + 1}
                width={794}
                blocks={pageBlocks(i + 1)}
                activeBlockIndices={activeBlockIndices}
                onBlockClick={onBlockClick}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
