"use client";

import React from "react";

interface PageBreakLineProps {
  pageNumber: number;
  contentPerPagePx: number;
  pagePadding: number;
}

/**
 * Visual page-break indicator — a red dashed line + label.
 *
 * Positioned at `pagePadding + pageNumber × contentPerPagePx`
 * from the content container's top — matching the PDF export's
 * page-break logic exactly.
 */
export const PageBreakLine = React.memo(function PageBreakLine({
  pageNumber,
  contentPerPagePx,
  pagePadding,
}: PageBreakLineProps) {
  const top = pagePadding + pageNumber * contentPerPagePx;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10 page-break-line"
      style={{ top: `${top}px` }}
    >
      <div className="relative w-full">
        <div className="absolute w-full border-t-2 border-dashed border-red-400" />
        <div className="absolute right-0 -top-6 text-xs text-red-500">
          第{pageNumber}页结束
        </div>
      </div>
    </div>
  );
});
