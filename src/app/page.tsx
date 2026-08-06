"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "@/components/ui/app-header";
import { cn } from "@/lib/utils";
import {
  Eye,
  Download,
  ArrowRight,
  Sparkles,
  FileSearch,
  MousePointerClick,
  Zap,
  TrendingUp,
  ShieldCheck,
  MessageSquare,
  Bot,
  User,
} from "lucide-react";

// ── 动画预设 ──
const fadeUp = {
  initial: { opacity: 1, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

const stagger = (delay = 0) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay },
});

// ── 浅色玻璃背景 ──
function GlassBackground() {
  return (
    <>
      <style>{`
        @keyframes glass-blob-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(80px, 40px) scale(1.04); }
          66% { transform: translate(-40px, -30px) scale(0.97); }
        }
        @keyframes glass-blob-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-70px, -50px) scale(0.96); }
          66% { transform: translate(50px, 30px) scale(1.05); }
        }
        @keyframes glass-blob-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, 60px) scale(1.03); }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* 浅色渐变基底 */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)",
          }}
        />
        {/* 点阵纹理 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        {/* 浅色模糊光球 */}
        <div
          className="absolute size-[700px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(16,185,129,0.15), transparent 70%)",
            filter: "blur(140px)",
            animation: "glass-blob-1 35s ease-in-out infinite",
            left: "5%",
            top: "-25%",
          }}
        />
        <div
          className="absolute size-[550px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(20,184,166,0.12), transparent 70%)",
            filter: "blur(120px)",
            animation: "glass-blob-2 38s ease-in-out infinite",
            right: "10%",
            top: "35%",
          }}
        />
        <div
          className="absolute size-[500px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(59,130,246,0.08), transparent 70%)",
            filter: "blur(130px)",
            animation: "glass-blob-3 40s ease-in-out infinite",
            left: "45%",
            bottom: "-10%",
          }}
        />
      </div>
    </>
  );
}

// ── 玻璃卡片 ──
function GlassCard({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/80 bg-white/60 backdrop-blur-xl transition-all duration-200",
        hover && "hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white/80",
        className,
      )}
      style={{
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      {children}
    </div>
  );
}

// ── 对话预览面板（浅色玻璃态） ──
const terminalLines = [
  { role: "user", text: "我是前端开发，5年+经验" },
  { role: "ai", text: "你好！我是你的简历顾问。" },
  { role: "user", text: "我在做简历 Agent 项目" },
  { role: "ai", text: "太棒了！用 LangGraph 搭建的对话流程非常前沿，具体说说..." },
  { role: "user", text: "Next.js + LangGraph + 智谱 API" },
  { role: "ai", text: "全栈 AI 架构！这个技术栈含金量很高" },
];

function ChatPreview() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((v) => (v < terminalLines.length ? v + 1 : v));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-xl"
      style={{
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-white/40 px-4 py-3">
        <Sparkles className="size-3.5 text-emerald-600" />
        <span className="text-xs font-medium text-slate-500 tracking-wide">简历顾问 · 对话</span>
        <div className="ml-auto flex gap-1.5">
          <div className="size-2 rounded-full bg-gray-300" />
          <div className="size-2 rounded-full bg-gray-300" />
          <div className="size-2 rounded-full bg-gray-300" />
        </div>
      </div>

      {/* 对话区 */}
      <div className="space-y-3 p-5 text-sm leading-relaxed">
        {terminalLines.slice(0, visible).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className={cn("flex gap-2.5", line.role === "user" ? "justify-end" : "")}
          >
            {line.role === "ai" && (
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <Bot className="size-3.5 text-emerald-600" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm",
                line.role === "user"
                  ? "bg-emerald-500/15 text-slate-800 rounded-br-md"
                  : "bg-white/80 text-slate-600 rounded-bl-md",
              )}
            >
              {line.text}
            </div>
            {line.role === "user" && (
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                <User className="size-3.5 text-emerald-600" />
              </div>
            )}
          </motion.div>
        ))}
        {visible <= terminalLines.length && (
          <motion.span
            className="ml-7 inline-block h-4 w-1 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
          />
        )}
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
    </div>
  );
}

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

// ── 模版列表 ──
const templates = [
  { id: "classic", name: "经典", desc: "简洁大方", gradient: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)" },
  { id: "modern", name: "现代", desc: "专业排版", gradient: "linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%)" },
  { id: "minimal", name: "极简", desc: "干净利落", gradient: "linear-gradient(135deg, #ffffff 0%, #f5f5f4 100%)" },
  { id: "ocean", name: "海洋", desc: "沉稳蓝色", gradient: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)" },
  { id: "forest", name: "森林", desc: "自然清新", gradient: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)" },
  { id: "slate", name: "岩板", desc: "低调高级", gradient: "linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)" },
  { id: "warm", name: "暖调", desc: "温暖亲和", gradient: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)" },
];

// ── 流程步骤 ──
const steps = [
  {
    step: 1,
    icon: MessageSquare,
    title: "跟 AI 聊你的经历",
    desc: "像跟朋友聊天一样，告诉 AI 你的工作经历、技能、项目经验，AI 会主动追问细节。",
    color: "bg-emerald-500",
  },
  {
    step: 2,
    icon: Sparkles,
    title: "AI 帮你组织优化",
    desc: "AI 自动把口语描述转成专业简历语言，用 STAR 法则改写经历，量化成果。",
    color: "bg-teal-500",
  },
  {
    step: 3,
    icon: Download,
    title: "导出高清 PDF",
    desc: "实时预览排版效果，一键导出专业排版的 PDF 简历，直接拿去投递。",
    color: "bg-cyan-500",
  },
];

const aiFeatures = [
  { icon: Sparkles, title: "AI 润色优化", desc: "用有力的动词和量化成果改写经历描述，让 HR 一眼看到亮点。", highlight: "GPT / DeepSeek" },
  { icon: FileSearch, title: "竞争力分析", desc: "AI 从 HR 视角评分，指出具体不足并给出可替换的改写建议。", highlight: "评分 + 建议" },
  { icon: MousePointerClick, title: "可视化编辑器", desc: "所见即所得编辑 PDF 模板，原位替换文字，保留原始排版不变。", highlight: "原位编辑" },
  { icon: TrendingUp, title: "投递追踪看板", desc: "看板管理已投 / 初筛 / 面试 / Offer 全流程，求职进度不遗漏。", highlight: "看板视图" },
];

const stats = [
  { value: 5, suffix: " 分钟", label: "完成一份专业简历" },
  { value: 0, suffix: " 元起", label: "基础功能永久免费" },
  { value: 99, suffix: "%", label: "AI 润色满意度" },
  { value: 1, suffix: " 次对话", label: "即可生成完整简历" },
];

const bottomFeatures = [
  { icon: Zap, title: "极速导出", desc: "浏览器端渲染，无需等待服务端，秒级导出 PDF" },
  { icon: ShieldCheck, title: "数据安全", desc: "对话数据加密存储，不上传至第三方服务" },
  { icon: Eye, title: "实时预览", desc: "聊完即刻预览简历效果，所见即所得，一键打印" },
];

function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-center text-2xl font-bold tracking-tight sm:text-3xl text-slate-900", className)}>
      {children}
    </h2>
  );
}

function SectionDesc({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto mt-4 max-w-xl text-center text-slate-500 text-base leading-relaxed">
      {children}
    </p>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)" }}>
      <GlassBackground />

      <AppHeader />
      <div
        className="h-px w-full"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(16,185,129,0.3), rgba(20,184,166,0.3), transparent)",
        }}
      />

      <main>
        {/* ═══ Hero ═══ */}
        <section className="relative px-4 pt-16 pb-12 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
              <div>
                <motion.div {...stagger(0)}>
                  <Badge className="mb-6 gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-1.5 text-sm rounded-full">
                    <Sparkles className="size-3.5" />
                    AI 驱动的智能简历 Agent
                  </Badge>
                </motion.div>

                <motion.h1
                  className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-slate-900"
                  {...stagger(0.1)}
                >
                  跟 AI 聊聊
                  <br />
                  <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                    一份专业简历就出来了
                  </span>
                </motion.h1>

                <motion.p
                  className="mt-6 max-w-lg text-slate-500 text-lg leading-relaxed"
                  {...stagger(0.2)}
                >
                  像跟朋友聊天一样告诉 AI 你的经历，AI 会主动追问、帮你组织语言，聊完自动生成排版精美的简历 PDF。
                </motion.p>

                <motion.div className="mt-8 flex flex-col items-start gap-3 sm:flex-row" {...stagger(0.3)}>
                  <Button asChild size="lg" className="h-12 px-8 text-base border-0 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white transition-all duration-200"
                    style={{ boxShadow: "0 0 24px rgba(16,185,129,0.25)" }}
                  >
                    <Link href="/chat">
                      <Sparkles className="mr-1.5 size-5" />
                      开始对话 <ArrowRight className="ml-1 size-5" />
                    </Link>
                  </Button>
                </motion.div>

                <motion.p className="mt-6 text-xs text-slate-400" {...stagger(0.4)}>
                  无需注册 · 基础功能永久免费 · 数据自动清理
                </motion.p>
              </div>

              <motion.div {...stagger(0.2)} className="relative">
                <ChatPreview />

                <motion.div
                  className="absolute -right-2 -top-4 flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 backdrop-blur-xl px-3 py-1.5 text-xs text-emerald-700"
                  style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Bot className="size-3" /> LangGraph Agent
                </motion.div>
                <motion.div
                  className="absolute -bottom-3 -left-3 flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 backdrop-blur-xl px-3 py-1.5 text-xs text-teal-700"
                  style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}
                  animate={{ y: [0, 5, 0] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                >
                  <Sparkles className="size-3" /> DeepSeek + 智谱
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══ 数据行 ═══ */}
        <section className="mx-auto max-w-3xl px-4 pb-16">
          <motion.div className="grid grid-cols-2 gap-4 sm:grid-cols-4" {...fadeUp}>
            {stats.map((s) => (
              <GlassCard key={s.label}>
                <div className="p-5 text-center">
                  <div className="text-2xl font-extrabold text-emerald-600 tabular-nums sm:text-3xl">
                    <AnimatedNumber target={s.value} suffix={s.suffix} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{s.label}</p>
                </div>
              </GlassCard>
            ))}
          </motion.div>
        </section>

        {/* ═══ 三步流程 ═══ */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <SectionTitle>三步搞定专业简历</SectionTitle>
          <SectionDesc>从空白到投递，AI 全程辅助每一步。</SectionDesc>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <motion.div key={s.step} className="group relative" {...stagger(i * 0.12)}>
                <GlassCard className="h-full text-center">
                  <div className="flex flex-col items-center p-6 pt-14">
                    <div className={cn(
                      "absolute -top-5 left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full text-white text-sm font-bold shadow-lg",
                      s.color,
                    )}>
                      {s.step}
                    </div>
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors duration-200">
                      <s.icon className="size-6 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-lg text-slate-900">{s.title}</h3>
                    <p className="mt-2 text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                  </div>
                </GlassCard>
                {i < steps.length - 1 && (
                  <div
                    className="absolute top-9 left-[60%] hidden w-[80%] border-t sm:block"
                    style={{ borderColor: "rgba(0,0,0,0.08)", borderStyle: "dashed" }}
                  />
                )}
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══ 模版展示 ═══ */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <SectionTitle>多款专业模版</SectionTitle>
          <SectionDesc>从经典到现代，总有一款适合你。</SectionDesc>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {templates.map((t, i) => (
              <motion.div key={t.id} {...stagger(i * 0.08)}>
                <Link href={`/chat`} className="group block">
                  <div
                    className="relative aspect-[3/4] rounded-xl overflow-hidden border border-gray-200 transition-shadow hover:shadow-lg"
                    style={{ background: t.gradient }}
                  >
                    {/* 模拟简历布局 */}
                    <div className="absolute inset-0 flex flex-col p-4">
                      <div className="mb-3 h-3 w-2/3 rounded-full bg-white/40" />
                      <div className="mb-2 h-2 w-1/3 rounded-full bg-white/25" />
                      <div className="mb-3 h-2 w-1/2 rounded-full bg-white/25" />
                      <div className="mb-2 h-1.5 w-full rounded-full bg-white/15" />
                      <div className="mb-1.5 h-1.5 w-full rounded-full bg-white/15" />
                      <div className="mb-1.5 h-1.5 w-5/6 rounded-full bg-white/15" />
                      <div className="mb-3 h-1.5 w-4/6 rounded-full bg-white/15" />
                      <div className="mb-2 h-2 w-1/3 rounded-full bg-white/25" />
                      <div className="mb-1.5 h-1.5 w-full rounded-full bg-white/15" />
                      <div className="mb-1.5 h-1.5 w-full rounded-full bg-white/15" />
                      <div className="h-1.5 w-3/4 rounded-full bg-white/15" />
                    </div>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 transition-colors">
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                        立即体验
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-sm font-medium text-slate-700">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.desc}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl bg-gray-200" />

        {/* ═══ AI 能力 ═══ */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-6 text-emerald-500" />
              AI 核心能力
            </span>
          </SectionTitle>
          <SectionDesc>AI 从对话、润色到导出，一站式搞定专业简历。</SectionDesc>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aiFeatures.map((f, i) => (
              <motion.div key={f.title} {...stagger(i * 0.08)}>
                <GlassCard className="h-full">
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50">
                        <f.icon className="size-5 text-emerald-600" />
                      </div>
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded-full">
                        {f.highlight}
                      </Badge>
                    </div>
                    <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══ 底部亮点 ═══ */}
        <section className="px-4 py-16 sm:py-20" style={{ background: "rgba(255,255,255,0.4)" }}>
          <div className="mx-auto max-w-3xl">
            <div className="grid gap-6 sm:grid-cols-3">
              {bottomFeatures.map((f, i) => (
                <motion.div key={f.title} className="text-center" {...stagger(i * 0.1)}>
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-white/80 bg-white/60 backdrop-blur-xl">
                    <f.icon className="size-4 text-emerald-600" />
                  </div>
                  <h3 className="mt-4 font-semibold text-sm text-slate-900">{f.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="px-4 py-20 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-slate-900">
              准备好拿下心仪 Offer 了吗？
            </h2>
            <p className="mt-3 text-slate-500">基础功能永久免费，高级模板按需解锁。</p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="h-12 px-8 text-base border-0 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white transition-all duration-200"
                style={{ boxShadow: "0 0 24px rgba(16,185,129,0.25)" }}
              >
                <Link href="/chat">
                  <Sparkles className="mr-1.5 size-5" />开始对话 <ArrowRight className="ml-1.5 size-5" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-gray-200 py-8 text-center text-sm text-slate-400">
        <p>Resume Go Offer &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
