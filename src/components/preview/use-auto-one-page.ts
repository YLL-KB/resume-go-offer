"use client";

import { useMemo } from "react";

/**
 * Physical / layout constants shared with PDF export logic.
 */
export const MM_TO_PX = 3.78;
export const A4_HEIGHT_MM = 297;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_PX = Math.round(A4_HEIGHT_MM * MM_TO_PX); // ≈ 1123
export const A4_WIDTH_PX = Math.round(A4_WIDTH_MM * MM_TO_PX);   // ≈ 794

/** Default padding inside the A4 paper (matches TemplateClassic p-8). */
export const PAGE_PADDING_PX = 32;

/** Max scale-down for auto-one-page before we give up. */
const MIN_SCALE = 0.55;

interface UseAutoOnePageOptions {
  /** Measured clientHeight of the content element (includes padding). */
  contentHeight: number;
  /** Padding inside the A4 page (px). */
  pagePadding?: number;
  /** Whether auto-one-page mode is enabled. */
  enabled: boolean;
}

interface UseAutoOnePageResult {
  /** Scale factor to apply (1 = no scaling). */
  scaleFactor: number;
  /** True when scaling is actually being applied. */
  isScaled: boolean;
  /** True when content is too long to fit on one page even after scaling. */
  cannotFit: boolean;
}

/**
 * Calculates the scale factor needed to squeeze content onto a single A4 page.
 *
 * Returns `{ scaleFactor, isScaled, cannotFit }`.
 * - `isScaled` = auto-one-page is ON *and* content exceeds one page.
 * - `cannotFit` = even after scaling down to MIN_SCALE, content still won't fit.
 */
export function useAutoOnePage({
  contentHeight,
  pagePadding = PAGE_PADDING_PX,
  enabled,
}: UseAutoOnePageOptions): UseAutoOnePageResult {
  return useMemo(() => {
    // Available content height per A4 page (after removing padding on both sides).
    const contentPerPagePx = A4_HEIGHT_PX - 2 * pagePadding;

    if (!enabled || contentHeight <= contentPerPagePx) {
      return { scaleFactor: 1, isScaled: false, cannotFit: false };
    }

    const factor = contentPerPagePx / contentHeight;

    if (factor < MIN_SCALE) {
      // Too much content — can't squeeze onto one page.
      return { scaleFactor: 1, isScaled: false, cannotFit: true };
    }

    return {
      scaleFactor: factor,
      isScaled: true,
      cannotFit: false,
    };
  }, [contentHeight, pagePadding, enabled]);
}

/**
 * Calculate page-break positions for multi-page content.
 *
 * 1. Subtracts 2×pagePadding from contentHeight to get actual content area.
 * 2. Divides actual content area by contentPerPage to get page count.
 * 3. Returns breaks at `pagePadding + N × contentPerPagePx`.
 *
 * Supports scaling: when isScaled is true and content fills multiple
 * unscaled pages, `contentPerPagePx` is divided by `scaleFactor` to
 * account for the local-coordinate stretch inside the scaled container.
 *
 * When the content cannot fit on one page even after scaling (cannotFit),
 * page breaks are still shown so the user knows exactly where pages cut.
 */
export function usePageBreaks(
  contentHeight: number,
  pagePadding: number = PAGE_PADDING_PX,
  isScaled: boolean = false,
  scaleFactor: number = 1,
): { contentPerPagePx: number; pageBreakCount: number } {
  return useMemo(() => {
    const contentPerPagePx = A4_HEIGHT_PX - 2 * pagePadding;

    if (contentHeight <= 0) {
      return { contentPerPagePx, pageBreakCount: 0 };
    }

    // Effective per-page capacity under scale
    const effectiveContentPerPage = isScaled
      ? contentPerPagePx / scaleFactor
      : contentPerPagePx;

    // Actual content height (strip padding from both sides)
    const actualContentHeight = contentHeight - 2 * pagePadding;
    if (actualContentHeight <= 0) {
      return { contentPerPagePx, pageBreakCount: 0 };
    }

    const pageCount = Math.max(1, Math.ceil(actualContentHeight / effectiveContentPerPage));
    const pageBreakCount = Math.max(0, pageCount - 1);

    return { contentPerPagePx: effectiveContentPerPage, pageBreakCount };
  }, [contentHeight, pagePadding, isScaled, scaleFactor]);
}
