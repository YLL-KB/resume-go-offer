"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Simple throttle — avoids lodash dependency.
 * Guarantees at most one call per `ms` interval.
 */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): T {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

/**
 * Monitor live content height via MutationObserver + ResizeObserver.
 *
 * Returns the current `clientHeight` of the observed element.
 * Updates are throttled to ~100ms and batched via requestAnimationFrame.
 */
export function useContentHeight(
  ref: React.RefObject<HTMLElement | null>
): number {
  const [height, setHeight] = useState(0);
  // Keep latest height in a ref so the throttle closure doesn't stale-out.
  const heightRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = throttle(() => {
      requestAnimationFrame(() => {
        const h = el.clientHeight;
        if (h > 0 && h !== heightRef.current) {
          heightRef.current = h;
          setHeight(h);
        }
      });
    }, 100);

    const mo = new MutationObserver(update);
    mo.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    const ro = new ResizeObserver(update);
    ro.observe(el);

    // Initial measurement
    update();

    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [ref]);

  return height;
}
