/**
 * trace 落库 — fire-and-forget，写入失败静默忽略
 *
 * 把 TraceCollector 收集到的 trace/spans/events 一次性 insert 进
 * ai_traces/ai_spans/ai_events 三张表。照抄 request-logger 的
 * `.then().catch(() => {})` 模式，不阻塞响应、不影响业务。
 */

import { getDb } from "../../db";
import { aiTraces, aiSpans, aiEvents } from "../../db/schema";
import { TraceCollector, SpanInput, EventInput } from "./collector";

const MAX_FIELD_LENGTH = 4000;

function serialize(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length > MAX_FIELD_LENGTH) {
    return `${str.slice(0, MAX_FIELD_LENGTH)}...[truncated ${str.length - MAX_FIELD_LENGTH} chars]`;
  }
  return str;
}

function toSpanRow(traceId: string, span: SpanInput) {
  return {
    id: crypto.randomUUID(),
    traceId,
    parentSpanId: span.parentSpanId,
    type: span.type,
    name: span.name,
    node: span.node,
    model: span.model,
    input: serialize(span.input),
    output: serialize(span.output),
    tokens: span.tokens ?? 0,
    durationMs: span.durationMs,
    status: span.status ?? "success",
    errorMessage: span.errorMessage,
    timestamp: new Date().toISOString(),
  };
}

function toEventRow(traceId: string, event: EventInput) {
  return {
    id: crypto.randomUUID(),
    traceId,
    spanId: event.spanId,
    type: event.type,
    name: event.name,
    detail: serialize(event.detail),
    timestamp: new Date().toISOString(),
  };
}

export async function persistTrace(collector: TraceCollector): Promise<void> {
  try {
    const db = getDb();
    const timestamp = new Date().toISOString();

    await db.insert(aiTraces).values({
      id: collector.id,
      requestLogId: collector.requestLogId,
      conversationId: collector.conversationId,
      userId: collector.userId,
      mode: collector.mode,
      model: collector.model,
      input: collector.input,
      output: collector.output,
      totalTokens: collector.totalTokens,
      durationMs: collector.durationMs(),
      status: collector.status(),
      errorMessage: collector.errorMessage,
      timestamp,
    });

    if (collector.spans.length > 0) {
      await db
        .insert(aiSpans)
        .values(collector.spans.map((s) => toSpanRow(collector.id, s)));
    }

    if (collector.events.length > 0) {
      await db
        .insert(aiEvents)
        .values(collector.events.map((e) => toEventRow(collector.id, e)));
    }
  } catch {
    // trace 落库失败不影响业务
  }
}

export function persistTraceFireAndForget(collector: TraceCollector): void {
  persistTrace(collector).catch(() => {});
}
