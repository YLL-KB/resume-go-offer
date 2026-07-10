"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "@/components/ui/app-header";
import { cn } from "@/lib/utils";
import {
  LayoutTemplate,
  Eye,
  Download,
  ArrowRight,
  Sparkles,
  ScanEye,
  FileSearch,
  MousePointerClick,
  Zap,
  TrendingUp,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";

// ── 动画预设 ──
const fadeUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

const stagger = (delay = 0) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay },
});

// ── 数字滚动 ──
function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1500;
    const step = Math.max(1, Math.floor(target / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── 流程步骤 ──
const steps = [
  {
    step: 1,
    icon: MessageSquare,
    title: "跟 AI 聊你的经历",
    desc: "像跟朋友聊天一样，告诉 AI 你的工作经历、技能、项目经验，AI 会主动追问细节。",
    color: "from-violet-500 to-purple-600",
  },
  {
    step: 2,
    icon: Sparkles,
    title: "AI 帮你组织优化",
    desc: "AI 自动把口语描述转成专业简历语言，用 STAR 法则改写经历，量化成果。",
    color: "from-blue-500 to-cyan-500",
  },
  {
    step: 3,
    icon: Download,
    title: "导出高清 PDF",
    desc: "实时预览排版效果，一键导出专业排版的 PDF 简历，直接拿去投递。",
    color: "from-emerald-500 to-teal-500",
  },
];

// ── AI 能力卡片 ──
const aiFeatures = [
  {
    icon: ScanEye,
    title: "简历智能解析",
    desc: "上传 PDF 自动提取姓名、经历、技能等结构化信息，告别手动录入。",
    highlight: "OCR + AI",
  },
  {
    icon: Sparkles,
    title: "AI 润色优化",
    desc: "用有力的动词和量化成果改写经历描述，让 HR 一眼看到亮点。",
    highlight: "GPT / DeepSeek",
  },
  {
    icon: FileSearch,
    title: "竞争力分析",
    desc: "AI 从 HR 视角评分，指出具体不足并给出可替换的改写建议。",
    highlight: "评分 + 建议",
  },
  {
    icon: LayoutTemplate,
    title: "专业模板库",
    desc: "经典、现代、极简多套模板一键切换，适配不同行业和职级。",
    highlight: "持续更新",
  },
  {
    icon: MousePointerClick,
    title: "可视化编辑器",
    desc: "所见即所得编辑 PDF 模板，原位替换文字，保留原始排版不变。",
    highlight: "原位编辑",
  },
  {
    icon: TrendingUp,
    title: "投递追踪看板",
    desc: "看板管理已投 / 初筛 / 面试 / Offer 全流程，求职进度不遗漏。",
    highlight: "看板视图",
  },
];

// ── 亮点数据 ──
const stats = [
  { value: 5, suffix: " 分钟", label: "完成一份专业简历" },
  { value: 3, suffix: " 套+", label: "精选简历模板" },
  { value: 98, suffix: "%", label: "AI 解析准确率" },
  { value: 0, suffix: " 元起", label: "基础功能永久免费" },
];

// ── 底部功能列表 ──
const bottomFeatures = [
  { icon: Zap, title: "极速导出", desc: "浏览器端渲染，无需等待服务端，秒级导出 PDF" },
  { icon: ShieldCheck, title: "数据安全", desc: "文件 30 分钟自动清理，不上传至第三方存储" },
  { icon: Eye, title: "实时预览", desc: "编辑内容即时反馈，所见即所得，支持多模板切换" },
];

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-center text-2xl font-bold tracking-tight sm:text-3xl", className)}>
      {children}
    </h2>
  );
}

function SectionDesc({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground text-base leading-relaxed">
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════
export default function HomePage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AppHeader />

      <main>
        {/* ═══ Hero ═══ */}
        <section className="relative px-4 pt-20 pb-12 sm:pt-28 sm:pb-20">
          {/* 背景光晕 */}
          <div className="pointer-events-none absolute inset-0 -top-24 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-4xl text-center">
            {/* Badge */}
            <motion.div {...stagger(0)}>
              <Badge variant="secondary" className="mb-6 gap-1.5 px-4 py-1.5 text-sm">
                <Sparkles className="size-3.5 text-primary" />
                AI 驱动的智能简历工具
              </Badge>
            </motion.div>

            {/* 主标题 */}
            <motion.h1
              className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
              {...stagger(0.1)}
            >
              跟 AI 聊聊
              <br />
              <span className="bg-gradient-to-r from-primary via-primary to-cyan-400 bg-clip-text text-transparent">
                一份专业简历就出来了
              </span>
            </motion.h1>

            {/* 副标题 */}
            <motion.p
              className="mx-auto mt-6 max-w-lg text-muted-foreground text-lg leading-relaxed"
              {...stagger(0.2)}
            >
              像跟朋友聊天一样告诉 AI 你的经历，AI 会主动追问、帮你组织语言，聊完自动生成排版精美的简历 PDF。
            </motion.p>

            {/* CTA */}
            <motion.div
              className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
              {...stagger(0.3)}
            >
              <Button asChild size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/25">
                <Link href="/chat">
                  <Sparkles className="mr-1.5 size-5" />
                  开始对话 <ArrowRight className="ml-1 size-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
                <Link href="/resume/builder">
                  手动填表单
                </Link>
              </Button>
            </motion.div>

            {/* 信任条 */}
            <motion.p
              className="mt-6 text-xs text-muted-foreground/70"
              {...stagger(0.4)}
            >
              无需注册 · 基础功能永久免费 · 数据自动清理
            </motion.p>
          </div>
        </section>

        {/* ═══ 数据行 ═══ */}
        <section className="mx-auto max-w-3xl px-4 pb-16">
          <motion.div
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            {...fadeUp}
          >
            {stats.map((s) => (
              <Card key={s.label} className="border-border/40 bg-muted/30 text-center">
                <CardContent className="p-5">
                  <div className="text-2xl font-extrabold text-primary tabular-nums sm:text-3xl">
                    <AnimatedNumber target={s.value} suffix={s.suffix} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </section>

        {/* ═══ 三步流程 ═══ */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <SectionTitle>三步搞定专业简历</SectionTitle>
          <SectionDesc>从空白到投递，AI 全程辅助每一步。</SectionDesc>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <motion.div
                key={s.step}
                className="group relative"
                {...stagger(i * 0.12)}
              >
                <Card className="relative h-full border-border/40 bg-card/50 transition-shadow hover:shadow-lg hover:shadow-primary/5">
                  <CardContent className="flex flex-col items-center p-6 pt-14 text-center">
                    {/* 步骤号 */}
                    <div
                      className={cn(
                        "absolute -top-5 left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br text-white text-sm font-bold shadow-lg",
                        s.color,
                      )}
                    >
                      {s.step}
                    </div>
                    {/* 图标 */}
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 transition-colors">
                      <s.icon className="size-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg">{s.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </CardContent>
                </Card>

                {/* 连接线 */}
                {i < steps.length - 1 && (
                  <div className="absolute top-9 left-[60%] hidden w-[80%] border-t-2 border-dashed border-border/60 sm:block" />
                )}
              </motion.div>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl" />

        {/* ═══ AI 能力 ═══ */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-6 text-primary" />
              AI 核心能力
            </span>
          </SectionTitle>
          <SectionDesc>不止做简历，AI 从解析、润色到分析全方位提升求职竞争力。</SectionDesc>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aiFeatures.map((f, i) => (
              <motion.div key={f.title} {...stagger(i * 0.08)}>
                <Card className="group h-full border-border/40 bg-card/50 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                        <f.icon className="size-5 text-primary" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {f.highlight}
                      </Badge>
                    </div>
                    <h3 className="mt-4 font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══ 底部亮点 ═══ */}
        <section className="bg-muted/30 px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <div className="grid gap-6 sm:grid-cols-3">
              {bottomFeatures.map((f, i) => (
                <motion.div key={f.title} className="text-center" {...stagger(i * 0.1)}>
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-background ring-1 ring-border">
                    <f.icon className="size-4 text-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold text-sm">{f.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="px-4 py-20 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              准备好拿下心仪 Offer 了吗？
            </h2>
            <p className="mt-3 text-muted-foreground">
              基础功能永久免费，高级模板按需解锁。
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/25">
                <Link href="/chat">
                  <Sparkles className="mr-1.5 size-5" />开始对话 <ArrowRight className="ml-1.5 size-5" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/resume/builder">
                  手动填表单 <LayoutTemplate className="ml-1.5 size-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>
          Resume Go Offer &copy; {new Date().getFullYear()} — 跑在 Cloudflare Pages 上
        </p>
      </footer>
    </div>
  );
}
