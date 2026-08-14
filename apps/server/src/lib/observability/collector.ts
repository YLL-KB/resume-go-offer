/**
 * AI trace 内存收集器 — 一次请求一个实例
 *
 * 由 chat.ts 在请求开始时创建，通过 AsyncLocalStorage（context.ts）暴露给
 * 降级埋点函数，请求结束时由 persist.ts 落库到 ai_traces/ai_spans/ai_events。
 */

export type TraceStatus = "success" | "degraded" | "error";
export type SpanType = "node" | "model" | "tool";
export type EventType = "degradation" | "error" | "info";

export interface SpanInput {
  type: SpanType;
  name: string;
  node?: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  tokens?: number;
  durationMs?: number;
  status?: TraceStatus;
  errorMessage?: string;
  parentSpanId?: string;
}

export interface EventInput {
  type: EventType;
  name: string;
  detail?: unknown;
  spanId?: string;
}

export interface TraceInit {
  conversationId: string;
  userId: string | null;
  input: string;
  requestLogId?: string | null;
}

export class TraceCollector {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string | null;
  readonly requestLogId: string | null;
  readonly input: string;
  readonly startedAt: number;

  output = "";
  mode?: string;
  model?: string;
  errorMessage?: string;
  totalTokens = 0;

  spans: SpanInput[] = [];
  events: EventInput[] = [];

  constructor(init: TraceInit) {
    this.id = crypto.randomUUID();
    this.conversationId = init.conversationId;
    this.userId = init.userId;
    this.requestLogId = init.requestLogId ?? null;
    this.input = init.input;
    this.startedAt = Date.now();
  }

  addSpan(span: SpanInput): void {
    this.spans.push(span);
  }

  addEvent(event: EventInput): void {
    this.events.push(event);
  }

  hasDegradation(): boolean {
    return this.events.some((e) => e.type === "degradation");
  }

  hasError(): boolean {
    return (
      this.events.some((e) => e.type === "error") ||
      this.spans.some((s) => s.status === "error")
    );
  }

  status(): TraceStatus {
    if (this.errorMessage || this.hasError()) return "error";
    if (this.hasDegradation() || this.spans.some((s) => s.status === "degraded")) {
      return "degraded";
    }
    return "success";
  }

  durationMs(): number {
    return Date.now() - this.startedAt;
  }
}
