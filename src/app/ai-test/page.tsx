"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AiTestPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleImprove = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    setResult("");

    try {
      const res = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });

      const data: { error?: string; improved?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "请求失败");
      setResult(data.improved ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 font-semibold text-lg hover:text-primary transition-colors"
          >
            <ArrowLeft className="size-5" />
            AI 润色测试
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl font-bold">AI 简历润色测试</h1>
          <p className="mt-2 text-muted-foreground">
            输入一段工作经历描述，AI 帮你优化成更专业的表达。
          </p>
        </motion.div>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">原始描述</label>
            <Textarea
              placeholder="例如：负责前端页面开发，使用 React 和 TypeScript"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
            />
          </div>

          <Button
            onClick={handleImprove}
            disabled={loading || !input.trim()}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {loading ? "润色中..." : "AI 润色"}
          </Button>

          {error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-4 text-sm text-destructive">
                {error}
              </CardContent>
            </Card>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary">
                    <Sparkles className="size-4" />
                    润色结果
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {result}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
