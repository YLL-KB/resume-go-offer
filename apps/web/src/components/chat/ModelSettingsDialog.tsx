"use client";

/**
 * 模型设置弹窗 — 用户自带 API（BYOK），1..N 条自定义 API 动态列表
 *
 * 每条 API：名称 / baseUrl / 模型 / Key / 用途多选（对话·提取·视觉）。
 * 同一用途配置多条时最早创建的生效；未配置的环节自动使用平台默认模型。
 * API Key 只进不出（服务端只回掩码）。
 */

import { useEffect, useState, useCallback } from "react";
import { KeyRound, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@resume/ui";
import { Button } from "@resume/ui";
import { toast } from "sonner";
import { ApiConfigCard, type ApiPublic } from "./ApiConfigCard";

const MAX_APIS = 10;

interface CardEntry {
  /** 稳定 key（已保存条目用 id，新建草稿用 draft-时间戳） */
  key: string;
  api: ApiPublic | null;
}

export function ModelSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<CardEntry[]>([]);
  const [devEphemeral, setDevEphemeral] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  const fetchApis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/ai-config");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as { apis?: ApiPublic[]; devEphemeral?: boolean };
      const list = data.apis ?? [];
      setCards(list.map((a) => ({ key: a.id, api: a })));
      setDevEphemeral(data.devEphemeral === true);
      setDraftCount(0);
    } catch {
      toast.error("获取 API 配置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchApis();
  }, [open, fetchApis]);

  const handleAdd = () => {
    if (cards.length >= MAX_APIS) {
      toast.error(`最多配置 ${MAX_APIS} 条 API`);
      return;
    }
    const key = `draft-${Date.now()}-${draftCount}`;
    setDraftCount((n) => n + 1);
    setCards((prev) => [...prev, { key, api: null }]);
  };

  const handleSaved = (cardKey: string, saved: ApiPublic) => {
    setCards((prev) => prev.map((c) => (c.key === cardKey ? { key: saved.id, api: saved } : c)));
  };

  const handleDeleted = (id: string) => {
    setCards((prev) => prev.filter((c) => c.key !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-emerald-600" />模型设置
          </DialogTitle>
          <DialogDescription>
            可添加 1 到多个你自己的 API（按你的供应商计费）。每条 API 可勾选用于哪些环节；同一环节配了多条时最早创建的那条生效，未配置的环节自动使用平台默认模型。
            {devEphemeral ? " ⚠️ 开发环境主密钥为临时密钥，服务重启后需重新保存。" : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-slate-300" />
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {cards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-xs text-slate-400">
                还没有配置自己的 API，点击下方「添加 API」开始
              </p>
            ) : null}
            {cards.map((card) => (
              <ApiConfigCard
                key={card.key}
                api={card.api}
                onSaved={(saved) => handleSaved(card.key, saved)}
                onDeleted={handleDeleted}
              />
            ))}
            <div className="flex justify-center pb-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAdd}
                disabled={cards.length >= MAX_APIS}
              >
                <Plus className="size-3.5 mr-1" />添加 API
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <p className="text-xs text-slate-400">API Key 仅加密存储在服务器，接口只返回掩码，平台不会读取你的明文 Key。</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
