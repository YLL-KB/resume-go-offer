"use client";

import { motion } from "framer-motion";
import { Sparkles, CheckCircle2, AlertCircle, Lightbulb, Target, TrendingUp, Wand2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "./ScoreRing";

interface AnalyzeResult { overview: string; strengths: string[]; weaknesses: string[]; suggestions: string[]; score: number; }

const fadeSlide = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" as const } };

export function ResultView({
  result, improving, improvements, onImprove, onParse, onExportWord, parsing, editing,
}: {
  result: AnalyzeResult; improving: string | null; improvements: Record<string, string>;
  onImprove: (target: string, type: "weakness" | "suggestion") => void;
  onParse?: () => void; onExportWord?: () => void; parsing: boolean; editing: boolean;
}) {
  return (
    <motion.div key="result" {...fadeSlide} className="space-y-4">
      {/* 工具栏 */}
      <Card className="border-border/40 shadow-sm">
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /><h3 className="font-semibold text-sm">分析报告</h3>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-xs"><Sparkles className="mr-1 size-3" />导出 PDF</Button>
            {onExportWord && <Button variant="outline" size="sm" onClick={onExportWord} className="h-8 text-xs"><Sparkles className="mr-1 size-3" />导出 Word</Button>}
          </div>
        </CardContent>
      </Card>

      {/* 评分卡片 */}
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <CardContent className="flex items-center gap-6 p-5">
          <ScoreRing score={result.score} size={110} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">综合评分</h3>
              {result.score >= 70 ? <Badge className="bg-emerald-100 text-emerald-700 text-[11px]">优秀</Badge>
                : result.score >= 50 ? <Badge className="bg-amber-100 text-amber-700 text-[11px]">良好</Badge>
                  : <Badge className="bg-red-100 text-red-700 text-[11px]">需改进</Badge>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{result.overview}</p>
            {onParse && !editing && (
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={onParse} disabled={parsing} className="h-8 text-xs">
                  {parsing ? <><Loader2 className="mr-1 size-3 animate-spin" />解析中</> : <>结构化编辑</>}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 亮点 + 不足 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-emerald-200/60 bg-emerald-50/30 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100"><TrendingUp className="size-3.5 text-emerald-600" /></div>
              <h4 className="font-semibold text-sm text-emerald-700">亮点</h4>
              <Badge variant="secondary" className="ml-auto text-[10px]">{result.strengths.length} 项</Badge>
            </div>
            <ul className="space-y-2">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /><span>{s}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-red-200/60 bg-red-50/20 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-7 items-center justify-center rounded-lg bg-red-100"><Target className="size-3.5 text-red-500" /></div>
              <h4 className="font-semibold text-sm text-red-700">需要改进</h4>
              <Badge variant="secondary" className="ml-auto text-[10px]">{result.weaknesses.length} 项</Badge>
            </div>
            <ul className="space-y-3">
              {result.weaknesses.map((w, i) => (
                <li key={i} className="group">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" /><span className="flex-1">{w}</span>
                    <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 shrink-0" disabled={improving === w} onClick={() => onImprove(w, "weakness")}>
                      {improving === w ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                    </Button>
                  </div>
                  {improvements[w] && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="ml-5 mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                      <div className="mb-1.5 flex items-center gap-1 text-primary font-medium"><Sparkles className="size-3" />AI 优化建议</div>
                      {improvements[w].split("\n").map((line, j) => <p key={j} className="mb-1 last:mb-0">{line}</p>)}
                    </motion.div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* 改进建议 */}
      <Card className="border-border/40 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100"><Lightbulb className="size-3.5 text-amber-600" /></div>
            <h4 className="font-semibold text-sm">改进建议</h4>
            <Badge variant="secondary" className="ml-auto text-[10px]">{result.suggestions.length} 条</Badge>
          </div>
          <ul className="space-y-3">
            {result.suggestions.map((s, i) => (
              <li key={i} className="group">
                <div className="flex items-start gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
                  <span className="flex-1 pt-0.5">{s}</span>
                  <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 shrink-0" disabled={improving === s} onClick={() => onImprove(s, "suggestion")}>
                    {improving === s ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  </Button>
                </div>
                {improvements[s] && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="ml-9 mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                    <div className="mb-1.5 flex items-center gap-1 text-primary font-medium"><Sparkles className="size-3" />AI 优化建议</div>
                    {improvements[s].split("\n").map((line, j) => <p key={j} className="mb-1 last:mb-0">{line}</p>)}
                  </motion.div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}
