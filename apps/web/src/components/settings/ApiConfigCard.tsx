"use client";

/**
 * 单条 API 配置卡片 — BYOK 动态列表中的一个条目
 *
 * 字段：名称 / 服务商预设 / baseUrl / 模型 / Key / 用途多选（对话·提取·视觉）。
 * 已保存条目支持「测试连接」「删除」，新条目保存后变为已保存条目。
 */

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2, CheckCircle2, XCircle, Server, Plus } from "lucide-react";
import { Button } from "@resume/ui";
import { Input } from "@resume/ui";
import { Label } from "@resume/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@resume/ui";
import { Badge } from "@resume/ui";
import { toast } from "sonner";

export type ApiScope = "chat" | "extract" | "vision";

export interface ApiPublic {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  scopes: ApiScope[];
  isActive: boolean;
  maskedKey: string;
  lastTestAt: string | null;
  lastTestOk: number | null;
}

const PRESETS: Record<string, { label: string; baseUrl: string; model: string }> = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  zhipu: { label: "智谱 BigModel", baseUrl: "https://open.bigmodel.cn/api/paas/v4/", model: "glm-4-plus" },
  moonshot: { label: "Moonshot", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
};

const SCOPE_META: Record<ApiScope, { label: string; hint: string }> = {
  chat: { label: "对话", hint: "主对话/标题/润色/分析" },
  extract: { label: "提取", hint: "简历提取/附件解析" },
  vision: { label: "视觉", hint: "岗位截图识别" },
};

export function ApiConfigCard({
  api,
  onSaved,
  onDeleted,
}: {
  /** null = 新建未保存的卡片 */
  api: ApiPublic | null;
  onSaved: (saved: ApiPublic) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(api?.name ?? "");
  const [provider, setProvider] = useState(api?.provider ?? "custom");
  const [baseUrl, setBaseUrl] = useState(api?.baseUrl ?? "");
  const [model, setModel] = useState(api?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(api?.scopes ?? []);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);

  useEffect(() => {
    if (api) {
      setName(api.name);
      setProvider(api.provider);
      setBaseUrl(api.baseUrl);
      setModel(api.model);
      setScopes(api.scopes);
      setApiKey("");
      setTestResult(null);
    }
  }, [api]);

  const applyPreset = (value: string) => {
    setProvider(value);
    const preset = PRESETS[value];
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
    } else {
      setBaseUrl("");
      setModel("");
    }
  };

  const toggleScope = (scope: ApiScope) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  };

  const handleTest = async () => {
    if (!api?.id) {
      toast.error("先保存这条 API 再测试连接");
      return;
    }
    setBusy("test");
    setTestResult(null);
    try {
      const res = await fetch("/api/user/ai-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: api.id }),
      });
      const data = (await res.json()) as { ok?: boolean; latencyMs?: number; error?: string };
      if (!res.ok) {
        setTestResult({ ok: false, error: data.error ?? "测试失败" });
        return;
      }
      setTestResult({ ok: data.ok === true, latencyMs: data.latencyMs, error: data.error });
    } catch {
      setTestResult({ ok: false, error: "网络错误" });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !model.trim() || !apiKey.trim()) {
      toast.error("请填写 baseUrl、模型名和 API Key");
      return;
    }
    if (scopes.length === 0) {
      toast.error("请至少选择一个用途（对话/提取/视觉）");
      return;
    }
    setBusy("save");
    try {
      const res = await fetch("/api/user/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: api?.id,
          name: name.trim(),
          provider,
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKey: apiKey.trim(),
          scopes,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; id?: string; apis?: ApiPublic[] };
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      const saved = (data.apis ?? []).find((a) => a.id === data.id) ?? null;
      if (saved) onSaved(saved);
      setApiKey("");
      setTestResult(null);
      toast.success("API 已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!api?.id) return;
    setBusy("save");
    try {
      const res = await fetch(`/api/user/ai-config?id=${api.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      onDeleted(api.id);
      toast.success("已删除该 API");
    } catch {
      toast.error("删除失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${api ? "border-emerald-100 bg-emerald-50/30" : "border-dashed border-slate-200 bg-white"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {api ? <Server className="size-4 shrink-0 text-emerald-600" /> : <KeyRound className="size-4 shrink-0 text-slate-400" />}
          <span className="truncate text-sm font-medium text-slate-800">
            {api ? (api.name || "未命名 API") : "新 API"}
          </span>
          {api ? (
            <Badge variant="secondary" className="shrink-0">{api.maskedKey}</Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">未保存</Badge>
          )}
          {api && api.lastTestOk !== null ? (
            <Badge variant={api.lastTestOk === 1 ? "default" : "destructive"} className="shrink-0">
              {api.lastTestOk === 1 ? "测试通过" : "测试失败"}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`api-name-${api?.id ?? "new"}`}>名称（可选，便于区分）</Label>
            <Input id={`api-name-${api?.id ?? "new"}`} placeholder="如：DeepSeek 主力号" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">服务商预设</Label>
            <Select value={provider} onValueChange={applyPreset}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择预设或自定义" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRESETS).map(([key, p]) => (
                  <SelectItem key={key} value={key}>{p.label}</SelectItem>
                ))}
                <SelectItem value="custom">自定义（OpenAI 兼容）</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`api-url-${api?.id ?? "new"}`}>API 地址（base_url）</Label>
          <Input id={`api-url-${api?.id ?? "new"}`} placeholder="https://api.deepseek.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`api-model-${api?.id ?? "new"}`}>模型名</Label>
          <Input id={`api-model-${api?.id ?? "new"}`} placeholder="deepseek-chat" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`api-key-${api?.id ?? "new"}`}>API Key（只存加密，永不明文返回）</Label>
          <Input
            id={`api-key-${api?.id ?? "new"}`}
            type="password"
            placeholder={api ? "留空则保留原 Key" : "sk-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">用途（可用于哪些环节，可多选）</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SCOPE_META) as ApiScope[]).map((s) => {
              const active = scopes.includes(s);
              return (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={active ? "" : "text-slate-500"}
                  onClick={() => toggleScope(s)}
                  title={SCOPE_META[s].hint}
                >
                  {SCOPE_META[s].label}
                </Button>
              );
            })}
          </div>
          {scopes.length === 0 ? (
            <p className="text-xs text-amber-600">未选择用途：该 API 不会生效</p>
          ) : null}
        </div>

        {testResult ? (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {testResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {testResult.ok
              ? `连接成功，响应 ${testResult.latencyMs ?? "-"}ms`
              : `连接失败：${testResult.error ?? "未知错误"}`}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          {api ? (
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={handleDelete} disabled={busy !== null}>
              <Trash2 className="size-3.5 mr-1" />删除
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={handleTest} disabled={busy !== null}>
            {busy === "test" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
            测试连接
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
            {api ? "保存" : <><Plus className="size-3.5 mr-1" />保存</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
