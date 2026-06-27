"use client";

import { useRef, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useContentHeight } from "./use-content-height";
import {
  useAutoOnePage,
  usePageBreaks,
  PAGE_PADDING_PX,
} from "./use-auto-one-page";
import { PageBreakLine } from "./page-break-line";

// ───────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────

export interface PreviewPanelProps {
  children: ReactNode;
  autoOnePage?: boolean;
  onSectionClick?: (sectionId: string) => void;
  className?: string;
  /** Padding inside the A4 page (px). Defaults to 32. */
  pagePadding?: number;
}

// ───────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────

export function PreviewPanel({
  children,
  autoOnePage = false,
  onSectionClick,
  className,
  pagePadding = PAGE_PADDING_PX,
}: PreviewPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const contentHeight = useContentHeight(contentRef);

  // Auto one page
  const { scaleFactor, isScaled, cannotFit } = useAutoOnePage({
    contentHeight,
    pagePadding,
    enabled: autoOnePage,
  });

  // Page breaks — same calculation engine as PDF export
  const { contentPerPagePx, pageBreakCount } = usePageBreaks(
    contentHeight,
    pagePadding,
    isScaled,
    scaleFactor,
  );

  // Click-to-edit
  const handleClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSectionClick) return;
      const target = e.target as HTMLElement;
      const sectionEl = target.closest("[data-resume-section-id]");
      const sectionId = (sectionEl as HTMLElement | null)?.dataset
        .resumeSectionId;
      if (sectionId) {
        onSectionClick(sectionId);
      }
    },
    [onSectionClick]
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 overflow-auto",
        className
      )}
    >
      {/* Toast: content too long to squeeze into one page */}
      {cannotFit && (
        <div className="w-full max-w-[210mm] rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          内容过多，无法压缩到一页。请精简内容或关闭「自动一页纸」。
        </div>
      )}

      {/* Screen-adaptation scale (L1) */}
      <div className="w-full max-w-[210mm] origin-top scale-[0.58] md:scale-90 md:origin-top-left">
        {/* A4 paper simulation */}
        <div className="relative bg-white shadow-lg print:shadow-none mx-auto">
          {/* Content container */}
          <div
            ref={contentRef}
            id="resume-preview"
            onClickCapture={handleClickCapture}
            className="relative"
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: `${pagePadding}px`,
              // L2 auto-one-page scaling
              ...(isScaled
                ? {
                    transform: `scale(${scaleFactor})`,
                    transformOrigin: "top left",
                    width: `${210 / scaleFactor}mm`,
                  }
                : {}),
            }}
          >
            {/* Grammar-error highlight styles */}
            <style jsx global>{`
              .grammar-error {
                cursor: help;
                border-bottom: 2px dashed;
                transition: background-color 0.2s ease;
              }
              .grammar-error.spelling {
                border-color: #ef4444;
              }
              .grammar-error.grammar {
                border-color: #f59e0b;
              }
              .grammar-error:hover {
                background-color: rgba(239, 68, 68, 0.1);
              }
              .grammar-error[class*="active-"] {
                animation: grammarHighlight 2s ease-in-out;
              }
              @keyframes grammarHighlight {
                0% { background-color: transparent; }
                20% { background-color: rgba(239, 68, 68, 0.2); }
                80% { background-color: rgba(239, 68, 68, 0.2); }
                100% { background-color: transparent; }
              }
            `}</style>

            {children}

            {/* Page break indicators — rendered inside the content container */}
            {contentHeight > 0 && pageBreakCount > 0 && (
              <div key={`page-breaks-${contentHeight}`}>
                {Array.from(
                  { length: Math.min(pageBreakCount, 20) },
                  (_, i) => {
                    const pageNumber = i + 1;
                    const linePosition =
                      pagePadding + pageNumber * contentPerPagePx;
                    if (linePosition <= contentHeight) {
                      return (
                        <PageBreakLine
                          key={`pb-${pageNumber}`}
                          pageNumber={pageNumber}
                          contentPerPagePx={contentPerPagePx}
                          pagePadding={pagePadding}
                        />
                      );
                    }
                    return null;
                  }
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
