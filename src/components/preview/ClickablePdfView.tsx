"use client";

import { useCallback, useEffect, useState } from "react";
import NextImage from "next/image";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockTextData } from "@/lib/editor/html-parser";
import type { ImageBlock } from "@/lib/pdf/image-extractor";
import type { Module } from "@/lib/pdf/module-detector";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface TextBlock {
  x: number; y: number; width: number; height: number;
  text: string; page: number; globalIndex: number; pageHeight: number;
}

interface ClickablePdfViewProps {
  url: string;
  modules: Module[];
  activeModuleId: string | null;
  editedBlocks?: Map<number, BlockTextData>;
  deletedModules?: Set<string>;
  images?: ImageBlock[];
  activeImageId?: string | null;
  deletedImageIds?: Set<string>;
  onModuleClick: (moduleId: string) => void;
  onImageClick?: (image: ImageBlock) => void;
  onBlocksExtracted?: (blocks: TextBlock[]) => void;
}

import { extractTextBlocks } from "@/lib/pdf/text-extractor";

function toScreenY(pdfY: number, blockH: number, pageH: number): number {
  return pageH - pdfY - blockH;
}

// ── 计算模块包围盒 ──
function moduleBounds(mod: Module): { x: number; y: number; w: number; h: number; pageH: number } | null {
  if (mod.blocks.length === 0) return null;
  let minX = Infinity, maxX = -Infinity;
  let minSY = Infinity, maxSY = -Infinity;
  const pageH = mod.blocks[0].pageHeight;
  for (const b of mod.blocks) {
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x + b.width);
    const sy = toScreenY(b.y, b.height, pageH);
    minSY = Math.min(minSY, sy);
    maxSY = Math.max(maxSY, sy + b.height);
  }
  return { x: minX, y: minSY, w: maxX - minX, h: maxSY - minSY, pageH };
}

function PageWithOverlays({
  pageNumber, width, modules, activeModuleId, editedBlocks, deletedModules,
  images, activeImageId, deletedImageIds, onModuleClick, onImageClick,
}: {
  pageNumber: number; width: number;
  modules: Module[]; activeModuleId: string | null;
  editedBlocks?: Map<number, BlockTextData>; deletedModules?: Set<string>;
  images?: ImageBlock[]; activeImageId?: string | null; deletedImageIds?: Set<string>;
  onModuleClick: (id: string) => void; onImageClick?: (img: ImageBlock) => void;
}) {
  const [scale, setScale] = useState(1);
  const [pageH, setPageH] = useState(0);
  const onLoad = useCallback((p: { originalWidth: number; originalHeight: number }) => {
    setScale(width / p.originalWidth);
    setPageH(p.originalHeight * (width / p.originalWidth));
  }, [width]);

  const pageModules = modules.filter((m) => m.page === pageNumber);
  const pageImages = (images ?? []).filter((img) => img.page === pageNumber);

  return (
    <div className="relative" style={{ width, height: pageH || "auto" }}>
      <Page pageNumber={pageNumber} width={width} renderTextLayer={false} renderAnnotationLayer={false} onLoadSuccess={onLoad} />

      {/* 图片覆盖层 */}
      {pageImages.map((img) => {
        if (deletedImageIds?.has(img.id)) return null;
        const isActive = activeImageId === img.id;
        return (
          <div key={img.id} onClick={(e) => { e.stopPropagation(); onImageClick?.(img); }}
            className={cn("absolute z-20 cursor-pointer border-2 rounded-sm overflow-hidden transition-colors",
              isActive ? "border-primary shadow-lg shadow-primary/30" : "border-dashed border-muted-foreground/20 hover:border-amber-400")}
            style={{ left: img.x * scale, top: img.y * scale, width: img.width * scale, height: img.height * scale }}>
            <NextImage src={img.dataUrl} alt="" fill unoptimized className="object-cover" />
          </div>
        );
      })}

      {/* 模块覆盖层：整个模块区域可点击 */}
      {pageModules.map((mod) => {
        const bounds = moduleBounds(mod);
        if (!bounds) return null;
        const isActive = mod.id === activeModuleId;
        const isDeleted = deletedModules?.has(mod.id);
        const left = bounds.x * scale;
        const top = bounds.y * scale;
        const mw = bounds.w * scale;
        const mh = bounds.h * scale;

        // 检查该模块是否有编辑
        let hasEdit = false;
        for (const b of mod.blocks) {
          if (editedBlocks?.has(b.globalIndex)) { hasEdit = true; break; }
        }

        return (
          <button key={mod.id} type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onModuleClick(mod.id); }}
            className={cn("absolute z-10 text-left transition-colors border border-dashed rounded-sm",
              isDeleted ? "bg-white/90 border-destructive/30" :
              isActive ? "bg-primary/10 border-primary ring-1 ring-primary" :
              hasEdit ? "bg-amber-500/5 border-amber-400/40 hover:bg-amber-500/10" :
              "border-transparent hover:bg-primary/5 hover:border-primary/20")}
            style={{ left: left - 2, top: top - 2, width: mw + 4, height: mh + 4 }}
            title={mod.label}
          >
            {/* 模块内显示编辑后的文字 */}
            {mod.blocks.map((block) => {
              const edited = editedBlocks?.get(block.globalIndex);
              const text = edited?.text;
              if (!text || isDeleted) return null;
              const sy = toScreenY(block.y, block.height, bounds.pageH);
              const fs = (edited?.fontSize ?? 11) * scale;
              const color = edited?.color ?? "#000000";
              const indent = edited?.textIndent ? `${fs * 2}px` : "0";
              return (
                <div key={block.globalIndex} className="absolute pointer-events-none"
                  style={{
                    left: (block.x - bounds.x) * scale,
                    top: (sy - bounds.y) * scale,
                    width: block.width * scale,
                    minHeight: block.height * scale,
                    background: "#fff",
                    fontSize: `${fs}px`,
                    textIndent: indent,
                    lineHeight: 1.5,
                    color,
                    fontFamily: edited?.fontFamily ?? "'PingFang SC','Heiti SC','Microsoft YaHei',sans-serif",
                    wordBreak: "break-all",
                    padding: "1px 2px",
                    boxSizing: "border-box",
                  }}
                >{text}</div>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}

export function ClickablePdfView({
  url, modules, activeModuleId, editedBlocks, deletedModules,
  images, activeImageId, deletedImageIds,
  onModuleClick, onImageClick, onBlocksExtracted,
}: ClickablePdfViewProps) {
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const result = await extractTextBlocks(url);
        if (!cancelled) { onBlocksExtracted?.(result); }
      } catch (err) { console.error("提取文本块失败:", err); }
      finally { if (!cancelled) setLoading(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [url, onBlocksExtracted]);

  const pageModules = useCallback((pn: number) => modules.filter((m) => m.page === pn), [modules]);

  return (
    <div className="flex flex-col items-center w-full">
      {loading && <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />识别可编辑区域...</div>}
      <div className="w-full max-w-[210mm] origin-top scale-[0.58] md:scale-90 md:origin-top-left">
        <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div className="flex items-center justify-center py-20 text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />加载模版...</div>}>
          {Array.from({ length: numPages }, (_, i) => (
            <div key={`page-${i + 1}`} className="bg-white shadow-lg mx-auto mb-4 last:mb-0" style={{ width: "210mm" }}>
              <PageWithOverlays pageNumber={i + 1} width={794} modules={pageModules(i + 1)}
                activeModuleId={activeModuleId} editedBlocks={editedBlocks} deletedModules={deletedModules}
                images={images} activeImageId={activeImageId} deletedImageIds={deletedImageIds}
                onModuleClick={onModuleClick} onImageClick={onImageClick} />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
