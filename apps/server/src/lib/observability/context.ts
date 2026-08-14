/**
 * 请求级 trace 上下文 — AsyncLocalStorage 传递当前请求的 collector
 *
 * 降级埋点函数（recordDegradation/recordError）从任意深处调用，
 * 无 collector（非 AI 请求）时静默 no-op，不抛错、不影响业务。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { TraceCollector } from "./collector";

const storage = new AsyncLocalStorage<TraceCollector>();

export function runWithTrace<T>(collector: TraceCollector, fn: () => T): T {
  return storage.run(collector, fn);
}

export function getTraceCollector(): TraceCollector | undefined {
  return storage.getStore();
}

export function recordEvent(
  type: "degradation" | "error" | "info",
  name: string,
  detail?: unknown,
): void {
  getTraceCollector()?.addEvent({ type, name, detail });
}

export function recordDegradation(name: string, detail?: unknown): void {
  recordEvent("degradation", name, detail);
}

export function recordError(name: string, detail?: unknown): void {
  recordEvent("error", name, detail);
}
