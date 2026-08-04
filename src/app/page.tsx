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
  Leaf,
} from "lucide-react";

// ── 动画预设 ──
const fadeUp = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

const stagger = (delay = 0) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay },
});

// ── 自然有机背景 ──
function NatureBackground() {
  return (
    <>
      <style>{`
        @keyframes nature-blob-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(80px, 40px) scale(1.04); }
          66% { transform: translate(-40px, -30px) scale(0.97); }
        }
        @keyframes nature-blob-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-70px, -50px) scale(0.96); }
          66% { transform: translate(50px, 30px) scale(1.05); }
        }
        @keyframes nature-blob-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, 60px) scale(1.03); }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* 纸纹基底 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(180,160,140,0.12) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        {/* 自然光晕 */}
        <div
          className="absolute size-[700px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(74,124,89,0.10), transparent 70%)",
            filter: "blur(140px)",
            animation: "nature-blob-1 35s ease-in-out infinite",
            left: "5%",
            top: "-25%",
          }}
        />
        <div
          className="absolute size-[550px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(91,140,158,0.08), transparent 70%)",
            filter: "blur(120px)",
            animation: "nature-blob-2 38s ease-in-out infinite",
            right: "10%",
            top: "35%",
          }}
        />
        <div
          className="absolute size-[500px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(193,125,90,0.07), transparent 70%)",
            filter: "blur(130px)",
            animation: "nature-blob-3 40s ease-in-out infinite",
            left: "45%",
            bottom: "-10%",
          }}
        />
      </div>
    </>
  );
}

// ── 柔和阴影卡片 ──
function SoftCard({
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
        "rounded-2xl border border-[#e8e0d5] bg-white transition-all duration-200",
        hover && "hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
      style={{
        boxShadow: "0 2px 16px rgba(80,60,30,0.04), 0 1px 3px rgba(80,60,30,0.03)",
      }}
    >
      {children}
    </div>
  );
}

// ── 对话预览面板（纸质笔记本风格） ──
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
    <div className="relative overflow-hidden rounded-2xl border border-[#e8e0d5] bg-[#fefdf9] shadow-md">
      {/* 标题栏 — 笔记本撕线风格 */}
      <div className="flex items-center gap-2 border-b border-[#f0ebe0] bg-[#faf6ef] px-4 py-3">
        <Leaf className="size-3.5 text-[#4a7c59]" />
        <span className="text-xs font-medium text-[#6b6859] tracking-wide">简历顾问 · 对话</span>
        <div className="ml-auto flex gap-1.5">
          <div className="size-2 rounded-full bg-[#e8d5c4]" />
          <div className="size-2 rounded-full bg-[#c4d5c4]" />
          <div className="size-2 rounded-full bg-[#c4cbd5]" />
        </div>
      </div>

      {/* 对话区域 */}
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
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#4a7c59]/12">
                <Bot className="size-3.5 text-[#4a7c59]" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm",
                line.role === "user"
                  ? "bg-[#e8f0ea] text-[#3d3929] rounded-br-md"
                  : "bg-[#f5f0e8] text-[#4a4a3d] rounded-bl-md",
              )}
            >
              {line.text}
            </div>
            {line.role === "user" && (
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#e8f0ea]">
                <User className="size-3.5 text-[#4a7c59]" />
              </div>
            )}
          </motion.div>
        ))}
        {/* 光标 */}
        {visible <= terminalLines.length && (
          <motion.span
            className="ml-7 inline-block h-4 w-1 rounded-full bg-[#4a7c59]/50"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
          />
        )}
      </div>

      {/* 底部装饰线 */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#d4c5a9] to-transparent" />
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

// ── 流程步骤 ──
const steps = [
  {
    step: 1,
    icon: MessageSquare,
    title: "跟 AI 聊你的经历",
    desc: "像跟朋友聊天一样，告诉 AI 你的工作经历、技能、项目经验，AI 会主动追问细节。",
    color: "bg-[#4a7c59]",
  },
  {
    step: 2,
    icon: Sparkles,
    title: "AI 帮你组织优化",
    desc: "AI 自动把口语描述转成专业简历语言，用 STAR 法则改写经历，量化成果。",
    color: "bg-[#5b8c9e]",
  },
  {
    step: 3,
    icon: Download,
    title: "导出高清 PDF",
    desc: "实时预览排版效果，一键导出专业排版的 PDF 简历，直接拿去投递。",
    color: "bg-[#c17d5a]",
  },
];

// ── AI 能力卡片 ──
const aiFeatures = [
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
    <h2 className={cn("text-center text-2xl font-bold tracking-tight sm:text-3xl text-[#3d3929]", className)}>
      {children}
    </h2>
  );
}

function SectionDesc({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto mt-4 max-w-xl text-center text-[#6b6859] text-base leading-relaxed">
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════
export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#faf7f2] overflow-x-hidden">
      <NatureBackground />

      {/* 导航栏底部装饰线 */}
      <header className="relative z-10">
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(74,124,89,0.3), rgba(91,140,158,0.3), transparent)",
          }}
        />
        <AppHeader variant="light" />
      </header>

      <main className="relative z-10">
        {/* ═══ Hero ═══ */}
        <section className="relative px-4 pt-16 pb-12 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
              {/* 左侧 — 文案 */}
              <div>
                <motion.div {...stagger(0)}>
                  <Badge className="mb-6 gap-1.5 border-[#4a7c59]/20 bg-[#4a7c59]/8 text-[#4a7c59] px-4 py-1.5 text-sm rounded-full">
                    <Leaf className="size-3.5" />
                    AI 驱动的智能简历 Agent
                  </Badge>
                </motion.div>

                <motion.h1
                  className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-[#3d3929]"
                  {...stagger(0.1)}
                >
                  跟 AI 聊聊
                  <br />
                  <span className="bg-gradient-to-r from-[#4a7c59] via-[#5b8c9e] to-[#8b7355] bg-clip-text text-transparent">
                    一份专业简历就出来了
                  </span>
                </motion.h1>

                <motion.p
                  className="mt-6 max-w-lg text-[#6b6859] text-lg leading-relaxed"
                  {...stagger(0.2)}
                >
                  像跟朋友聊天一样告诉 AI 你的经历，AI 会主动追问、帮你组织语言，聊完自动生成排版精美的简历 PDF。
                </motion.p>

                <motion.div
                  className="mt-8 flex flex-col items-start gap-3 sm:flex-row"
                  {...stagger(0.3)}
                >
                  <Button asChild size="lg" className="h-12 px-8 text-base border-0 bg-[#4a7c59] hover:bg-[#3d6b4a] text-white transition-colors duration-200"
                    style={{ boxShadow: "0 2px 16px rgba(74,124,89,0.2)" }}
                  >
                    <Link href="/chat">
                      <Sparkles className="mr-1.5 size-5" />
                      开始对话 <ArrowRight className="ml-1 size-5" />
                    </Link>
                  </Button>
                </motion.div>

                <motion.p
                  className="mt-6 text-xs text-[#9b9879]"
                  {...stagger(0.4)}
                >
                  无需注册 · 基础功能永久免费 · 数据自动清理
                </motion.p>
              </div>

              {/* 右侧 — 对话预览 + 浮动标签 */}
              <motion.div
                {...stagger(0.2)}
                className="relative"
              >
                <ChatPreview />

                {/* 浮动标签 */}
                <motion.div
                  className="absolute -right-2 -top-4 flex items-center gap-1.5 rounded-full border border-[#e8e0d5] bg-white/90 backdrop-blur px-3 py-1.5 text-xs text-[#4a7c59] shadow-sm"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Bot className="size-3" /> LangGraph Agent
                </motion.div>
                <motion.div
                  className="absolute -bottom-3 -left-3 flex items-center gap-1.5 rounded-full border border-[#e8e0d5] bg-white/90 backdrop-blur px-3 py-1.5 text-xs text-[#5b8c9e] shadow-sm"
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
          <motion.div
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            {...fadeUp}
          >
            {stats.map((s) => (
              <SoftCard key={s.label}>
                <div className="p-5 text-center">
                  <div className="text-2xl font-extrabold text-[#4a7c59] tabular-nums sm:text-3xl">
                    <AnimatedNumber target={s.value} suffix={s.suffix} />
                  </div>
                  <p className="mt-1 text-xs text-[#6b6859]">{s.label}</p>
                </div>
              </SoftCard>
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
                <SoftCard className="h-full text-center">
                  <div className="flex flex-col items-center p-6 pt-14">
                    <div
                      className={cn(
                        "absolute -top-5 left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full text-white text-sm font-bold shadow-md",
                        s.color,
                      )}
                    >
                      {s.step}
                    </div>
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[#f5f0e8] group-hover:bg-[#e8f0ea] transition-colors duration-200">
                      <s.icon className="size-6 text-[#4a7c59]" />
                    </div>
                    <h3 className="font-semibold text-lg text-[#3d3929]">{s.title}</h3>
                    <p className="mt-2 text-sm text-[#6b6859] leading-relaxed">{s.desc}</p>
                  </div>
                </SoftCard>

                {i < steps.length - 1 && (
                  <div
                    className="absolute top-9 left-[60%] hidden w-[80%] border-t sm:block"
                    style={{ borderColor: "#e8e0d5", borderStyle: "dashed" }}
                  />
                )}
              </motion.div>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl bg-[#e8e0d5]" />

        {/* ═══ AI 能力 ═══ */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-6 text-[#4a7c59]" />
              AI 核心能力
            </span>
          </SectionTitle>
          <SectionDesc>AI 从对话、润色到导出，一站式搞定专业简历。</SectionDesc>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aiFeatures.map((f, i) => (
              <motion.div key={f.title} {...stagger(i * 0.08)}>
                <SoftCard className="h-full">
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-[#f5f0e8] transition-colors duration-200">
                        <f.icon className="size-5 text-[#4a7c59]" />
                      </div>
                      <Badge className="border-[#4a7c59]/15 bg-[#4a7c59]/8 text-[#4a7c59] text-[10px] font-medium rounded-full">
                        {f.highlight}
                      </Badge>
                    </div>
                    <h3 className="mt-4 font-semibold text-[#3d3929]">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-[#6b6859] leading-relaxed">{f.desc}</p>
                  </div>
                </SoftCard>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══ 底部亮点 ═══ */}
        <section className="px-4 py-16 sm:py-20" style={{ background: "rgba(245,240,232,0.5)" }}>
          <div className="mx-auto max-w-3xl">
            <div className="grid gap-6 sm:grid-cols-3">
              {bottomFeatures.map((f, i) => (
                <motion.div key={f.title} className="text-center" {...stagger(i * 0.1)}>
                  <div
                    className="mx-auto flex size-10 items-center justify-center rounded-full ring-1 bg-white"
                    style={{ borderColor: "#e8e0d5" }}
                  >
                    <f.icon className="size-4 text-[#4a7c59]" />
                  </div>
                  <h3 className="mt-4 font-semibold text-sm text-[#3d3929]">{f.title}</h3>
                  <p className="mt-1 text-xs text-[#6b6859] leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="px-4 py-20 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-[#3d3929]">
              准备好拿下心仪 Offer 了吗？
            </h2>
            <p className="mt-3 text-[#6b6859]">
              基础功能永久免费，高级模板按需解锁。
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="h-12 px-8 text-base border-0 bg-[#4a7c59] hover:bg-[#3d6b4a] text-white transition-colors duration-200"
                style={{ boxShadow: "0 2px 16px rgba(74,124,89,0.2)" }}
              >
                <Link href="/chat">
                  <Sparkles className="mr-1.5 size-5" />开始对话 <ArrowRight className="ml-1.5 size-5" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#e8e0d5] py-8 text-center text-sm text-[#9b9879]">
        <p>
          Resume Go Offer &copy; {new Date().getFullYear()} — 跑在 Cloudflare Pages 上
        </p>
      </footer>
    </div>
  );
}
