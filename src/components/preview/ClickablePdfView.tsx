"use client";

import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockTextData } from "@/lib/editor/html-parser";
import type { ImageBlock } from "@/lib/pdf/image-extractor";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface TextBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  page: number;
  globalIndex: number;
  pageHeight: number;
}

interface ClickablePdfViewProps {
  url: string;
  activeBlockIndices: Set<number>;
  editedBlocks?: Map<number, BlockTextData>;
  deletedBlockIndices?: Set<number>;
  images?: ImageBlock[];
  activeImageId?: string | null;
  deletedImageIds?: Set<string>;
  onBlockClick: (block: TextBlock, index: number) => void;
  onImageClick?: (image: ImageBlock) => void;
  onBlocksExtracted?: (blocks: TextBlock[]) => void;
}

import { extractTextBlocks } from "@/lib/pdf/text-extractor";

function toScreenY(pdfY: number, blockHeight: number, pageHeight: number): number {
  return pageHeight - pdfY - blockHeight;
}

function PageWithOverlays({
  pageNumber,
  width,
  blocks,
  activeBlockIndices,
  editedBlocks,
  deletedBlockIndices,
  images,
  activeImageId,
  deletedImageIds,
  onBlockClick,
  onImageClick,
}: {
  pageNumber: number;
  width: number;
  blocks: TextBlock[];
  activeBlockIndices: Set<number>;
  editedBlocks?: Map<number, BlockTextData>;
  deletedBlockIndices?: Set<number>;
  images?: ImageBlock[];
  activeImageId?: string | null;
  deletedImageIds?: Set<string>;
  onBlockClick: (block: TextBlock, index: number) => void;
  onImageClick?: (image: ImageBlock) => void;
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

  const pageImages = images?.filter((img) => img.page === pageNumber) ?? [];

  return (
    <div className="relative" style={{ width, height: pageH || "auto" }}>
      <Page
        pageNumber={pageNumber}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        onLoadSuccess={onLoad}
      />

      {/* 图片覆盖层（跳过已删除的） */}
      {pageImages.map((img) => {
        if (deletedImageIds?.has(img.id)) return null;
        const left = img.x * scale;
        const top = img.y * scale;
        const w = img.width * scale;
        const h = img.height * scale;
        const isActive = activeImageId === img.id;

        return (
          <div
            key={img.id}
            className={cn(
              "absolute z-20 cursor-pointer border-2 rounded-sm overflow-hidden transition-colors",
              isActive
                ? "border-primary shadow-lg shadow-primary/30"
                : "border-dashed border-muted-foreground/20 hover:border-amber-400",
            )}
            style={{ left, top, width: w, height: h }}
            onClick={(e) => {
              e.stopPropagation();
              onImageClick?.(img);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.dataUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        );
      })}

      {/* 文本块覆盖层 */}
      {blocks.map((block) => {
        if (!block.pageHeight || !scale) return null;
        const left = block.x * scale;
        const screenY = toScreenY(block.y, block.height, block.pageHeight);
        const top = screenY * scale;
        if (Number.isNaN(left) || Number.isNaN(top)) return null;

        const isDeleted = deletedBlockIndices?.has(block.globalIndex) ?? false;
        const w = Math.max(block.width * scale, 40);
        const h = Math.max(block.height * scale, 12);
        const isActive = activeBlockIndices.has(block.globalIndex);
        const edited = editedBlocks?.get(block.globalIndex);

        const displayWidth = edited?.width ? edited.width * scale : w;
        const displayHeight = edited?.height ? edited.height * scale : h;

        // 已删除：可点击的白色覆盖层，点击可选中编辑/恢复
        if (isDeleted) {
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
                "absolute z-10 bg-white border border-dashed rounded-sm transition-colors cursor-pointer",
                isActive
                  ? "border-destructive bg-destructive/10"
                  : "border-destructive/30 hover:border-destructive/60",
              )}
              style={{
                left: left - 4,
                top: top - 4,
                width: displayWidth + 8,
                height: displayHeight + 8,
              }}
              title={`已删除: ${block.text.slice(0, 40)}（点击恢复）`}
            />
          );
        }

        // 已编辑
        if (edited && edited.text) {
          const fontSize = (edited.fontSize ?? 11) * scale;
          const indent = edited.textIndent ? `${fontSize * 2 * scale}px` : "0";
          const textColor = edited.color ?? "#000000";
          const fontFamily = edited.fontFamily ??
            "'PingFang SC','Heiti SC','Noto Sans SC','Microsoft YaHei',sans-serif";

          return (
            <div
              key={block.globalIndex}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBlockClick(block, block.globalIndex);
              }}
              className={cn(
                "absolute z-10 cursor-pointer rounded-sm overflow-hidden border border-dashed",
                isActive
                  ? "border-primary"
                  : "border-muted-foreground/15 hover:border-amber-400",
              )}
              style={{
                left,
                top,
                width: displayWidth,
                minHeight: displayHeight,
                background: "#ffffff",
                fontSize: `${fontSize}px`,
                textIndent: indent,
                lineHeight: 1.5,
                fontFamily,
                color: textColor,
                wordBreak: "break-all",
                padding: "1px 2px",
                boxSizing: "border-box",
              }}
              title={edited.text.slice(0, 80)}
            >
              {edited.text}
            </div>
          );
        }

        // 未编辑
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
            style={{ left, top, width: displayWidth, height: displayHeight }}
            title={block.text.slice(0, 80)}
          />
        );
      })}
    </div>
  );
}

export function ClickablePdfView({
  url,
  activeBlockIndices,
  editedBlocks,
  deletedBlockIndices,
  images,
  activeImageId,
  deletedImageIds,
  onBlockClick,
  onImageClick,
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
        const result = await extractTextBlocks(url);
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
    return () => { cancelled = true; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageBlocks = useCallback(
    (pageNum: number) => blocks.filter((b) => b.page === pageNum),
    [blocks],
  );

  return (
    <div className="flex flex-col items-center w-full">
      {loading && (
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
                editedBlocks={editedBlocks}
                deletedBlockIndices={deletedBlockIndices}
                images={images}
                activeImageId={activeImageId}
                deletedImageIds={deletedImageIds}
                onBlockClick={onBlockClick}
                onImageClick={onImageClick}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
