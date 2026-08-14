"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  AlertTriangle,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Workflow,
  Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@resume/ui";
import { Badge } from "@resume/ui";
import { Button } from "@resume/ui";
import { toast } from "sonner";

// ── 类型 ──

interface TraceDetailData {
  id: string;
  conversationId: string;
  userId: string | null;
  mode: string | null;
  model: string | null;
  input: string;
  output: string | null;
  totalTokens: number;
  durationMs: number;
  status: "success" | "degraded" | "error";
  errorMessage: string | null;
  timestamp: string;
}

interface SpanRow {
  id: string;
  type: "node" | "model" | "tool";
  name: string;
  node: string | null;
  model: string | null;
  input: string | null;
  output: string | null;
  tokens: number;
  durationMs: number | null;
  status: "success" | "degraded" | "error";
  errorMessage: string | null;
  timestamp: string;
}

interface EventRow {
  id: string;
  type: "degradation" | "error" | "info";
  name: string;
  detail: string | null;
  timestamp: string;
}

const DEGRADATION_LABELS: Record<string, string> = {
  router_json_fallback: "Router JSON 兜底",
  illegal_mode: "非法 mode",
  iteration_limit: "迭代超限",
  knowledge_init_failed: "知识库初始化失败",
  extract_null: "简历提取为空",
  suggest_fallback: "润色失败兜底",
  knowledge_empty: "知识库为空",
  knowledge_no_result: "知识库无结果",
  extract_json_retry: "提取 JSON 重试",
  regex_fallback: "正则兜底",
  llm_timeout: "LLM 超时",
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
  } catch {
    return iso;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  if (status === "success") return "bg-emerald-100 text-emerald-700";
  if (status === "degraded") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function statusLabel(status: string) {
  if (status === "success") return "成功";
  if (status === "degraded") return "降级";
  return "错误";
}

function typeBadge(type: string) {
  if (type === "node") return "bg-blue-100 text-blue-700";
  if (type === "model") return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-600";
}

function typeLabel(type: string) {
  if (type === "node") return "节点";
  if (type === "model") return "模型";
  return "工具";
}

function prettyJson(raw: string | null | undefined) {
  if (!raw) return "-";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// 生成可直接粘贴给 AI/同事分析的诊断文本
function buildDiagnosticText(trace: TraceDetailData, spans: SpanRow[], events: EventRow[]): string {
  const lines: string[] = [];
  lines.push("【AI Trace 诊断】");
  lines.push("");
  lines.push(`traceId: ${trace.id}`);
  lines.push(`状态: ${statusLabel(trace.status)}`);
  lines.push(`模式: ${trace.mode ?? "-"}`);
  lines.push(`模型: ${trace.model ?? "-"}`);
  lines.push(`耗时: ${(trace.durationMs / 1000).toFixed(1)}s`);
  lines.push(`Token: ${trace.totalTokens}`);
  lines.push(`时间: ${trace.timestamp}`);
  lines.push(`会话: ${trace.conversationId}`);
  lines.push(`用户: ${trace.userId ?? "匿名"}`);
  lines.push("");
  lines.push("【用户输入】");
  lines.push(trace.input);
  lines.push("");
  lines.push("【AI 回复】");
  lines.push(trace.output ?? "(空)");

  if (trace.errorMessage) {
    lines.push("");
    lines.push("【错误】");
    lines.push(trace.errorMessage);
  }

  if (events.length > 0) {
    lines.push("");
    lines.push("【事件】");
    for (const e of events) {
      const label = e.type === "degradation" ? DEGRADATION_LABELS[e.name] ?? e.name : e.name;
      lines.push(`- [${e.type}] ${label}${e.detail ? `: ${e.detail}` : ""}`);
    }
  }

  if (spans.length > 0) {
    lines.push("");
    lines.push("【调用链路】");
    for (const s of spans) {
      const dur = s.durationMs != null ? `${s.durationMs}ms` : "-";
      const tok = s.tokens > 0 ? ` | ${s.tokens} tok` : "";
      const model = s.model ? ` | ${s.model}` : "";
      lines.push(`- [${s.type}] ${s.name}${model}${tok} | ${dur} | ${statusLabel(s.status)}`);
    }
  }

  return lines.join("\n");
}

// ── 可展开区块 ──

function Collapsible({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
      >
        <span className="font-medium">{title}</span>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {open && (
        <pre className="max-h-96 overflow-auto bg-slate-50 px-4 py-3 text-xs text-slate-700 whitespace-pre-wrap break-all">
          {content}
        </pre>
      )}
    </div>
  );
}

// ── 页面组件 ──

export function TraceDetail({ id }: { id: string }) {
  const [data, setData] = useState<{
    trace: TraceDetailData;
    spans: SpanRow[];
    events: EventRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/traces/${id}`);
        if (res.status === 404) {
          setError("trace 不存在");
        } else if (!res.ok) {
          setError("获取 trace 详情失败");
        } else {
          setData(await res.json());
        }
      } catch {
        setError("获取 trace 详情失败");
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-300" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-slate-500">{error ?? "trace 不存在"}</p>
        <Link href="/traces" className="mt-4 inline-flex items-center gap-1 text-sm text-emerald-600">
          <ArrowLeft className="size-4" />返回列表
        </Link>
      </div>
    );
  }

  const { trace, spans, events } = data;

  const copyDiagnostic = async () => {
    try {
      await navigator.clipboard.writeText(buildDiagnosticText(trace, spans, events));
      toast.success("诊断信息已复制，可直接粘贴");
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/traces" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" />返回列表
        </Link>
        <Button variant="outline" size="sm" onClick={copyDiagnostic}>
          <Copy className="size-4 mr-1" />一键复制诊断信息
        </Button>
      </div>

      {/* 概览 */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 font-mono">{trace.id.slice(0, 18)}…</h1>
            <Badge className={`text-xs ${statusBadge(trace.status)}`}>{statusLabel(trace.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{formatDate(trace.timestamp)}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-slate-400 text-xs">耗时</span>
            <p className="font-mono text-slate-700">{(trace.durationMs / 1000).toFixed(1)}s</p>
          </div>
          <div>
            <span className="text-slate-400 text-xs">Token</span>
            <p className="font-mono text-slate-700">{trace.totalTokens}</p>
          </div>
          <div>
            <span className="text-slate-400 text-xs">模式</span>
            <p className="text-slate-700">{trace.mode ?? "-"}</p>
          </div>
          <div>
            <span className="text-slate-400 text-xs">模型</span>
            <p className="font-mono text-slate-700">{trace.model ?? "-"}</p>
          </div>
        </div>
      </div>

      {/* 会话 / 用户 */}
      <Card className="mb-6">
        <CardContent className="py-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-400 text-xs">会话 ID</span>
            <p className="font-mono text-slate-700 break-all">{trace.conversationId}</p>
          </div>
          <div>
            <span className="text-slate-400 text-xs">用户 ID</span>
            <p className="font-mono text-slate-700 break-all">{trace.userId ?? "匿名"}</p>
          </div>
        </CardContent>
      </Card>

      {/* 输入 / 输出 */}
      <div className="grid grid-cols-1 gap-3 mb-6">
        <Collapsible title="用户输入" content={trace.input} />
        <Collapsible title="最终回复" content={trace.output ?? "(空)"} />
        {trace.errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-medium">错误：</span>
            {trace.errorMessage}
          </div>
        )}
      </div>

      {/* 事件（降级/错误） */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <AlertTriangle className="size-4" />事件（{events.length}）
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {events.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">无事件</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {events.map((e) => (
                <li key={e.id} className="py-2 flex items-start gap-3 text-sm">
                  {e.type === "degradation" ? (
                    <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                  ) : e.type === "error" ? (
                    <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <Info className="size-4 text-slate-400 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-700">
                        {e.type === "degradation" ? DEGRADATION_LABELS[e.name] ?? e.name : e.name}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">{formatTime(e.timestamp)}</span>
                    </div>
                    {e.detail && <p className="text-xs text-slate-500 mt-0.5 font-mono break-all">{e.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Spans 时间线 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Workflow className="size-4" />调用链路（{spans.length}）
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {spans.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">无 span</p>
          ) : (
            <div className="space-y-2">
              {spans.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs ${typeBadge(s.type)}`}>{typeLabel(s.type)}</Badge>
                    <span className="text-sm font-medium text-slate-800">{s.name}</span>
                    {s.model && <span className="text-xs text-slate-400 font-mono">{s.model}</span>}
                    <span className="ml-auto text-xs text-slate-400 font-mono">
                      {s.durationMs != null ? `${s.durationMs}ms` : "-"}
                    </span>
                    {s.tokens > 0 && <span className="text-xs text-slate-400 font-mono">{s.tokens} tok</span>}
                    <Badge className={`text-xs ${statusBadge(s.status)}`}>{statusLabel(s.status)}</Badge>
                  </div>
                  {s.errorMessage && <p className="mt-1 text-xs text-red-600">{s.errorMessage}</p>}
                  {s.input && <Collapsible title="输入" content={prettyJson(s.input)} />}
                  {s.output && <Collapsible title="输出" content={prettyJson(s.output)} />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
