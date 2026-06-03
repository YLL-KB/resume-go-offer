"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import {
  FileText,
  LayoutTemplate,
  Eye,
  Download,
  Send,
  Menu,
  ArrowRight,
  CheckCircle2,
  LogIn,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: false, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

const steps = [
  {
    step: 1,
    icon: FileText,
    title: "分步填写",
    desc: "基本信息 → 教育 → 经历 → 项目 → 技能，向导式引导，5 分钟搞定。",
  },
  {
    step: 2,
    icon: Eye,
    title: "实时预览",
    desc: "经典 / 现代 / 极简模板一键切换，所见即所得。",
  },
  {
    step: 3,
    icon: Download,
    title: "导出投递",
    desc: "浏览器端一键导出 PDF，同步记录投递进度。",
  },
];

const features = [
  {
    icon: LayoutTemplate,
    title: "多套模板",
    desc: "至少 3 套专业模板，适配不同行业风格。",
  },
  {
    icon: Send,
    title: "投递追踪",
    desc: "看板视图管理已投 / 初筛 / 面试 / Offer，不遗漏。",
  },
  {
    icon: CheckCircle2,
    title: "版本对比",
    desc: "同一岗位多版本简历，随时对比回滚。",
  },
];

const navLinks = [
  { href: "/dashboard", label: "仪表盘" },
  { href: "/tracker", label: "投递追踪" },
  { href: "/settings", label: "设置" },
];

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-lg"
          >
            <FileText className="size-5" />
            Resume Go Offer
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {/* 根据登录状态切换：未登录 → 登录按钮，已登录 → 用户菜单 */}
            {isSignedIn ? (
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/dashboard">
                  {user?.name ?? "我的"}
                </Link>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/login">
                  <LogIn className="mr-1.5 size-4" />
                  登录
                </Link>
              </Button>
            )}
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/resume/new">开始制作</Link>
            </Button>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="sm:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="size-5" />
                  <span className="sr-only">打开菜单</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64 pt-12">
                <nav className="flex flex-col gap-4">
                  {navLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="text-lg font-medium hover:text-primary transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      {l.label}
                    </Link>
                  ))}
                  {/* 移动端：根据登录状态切换 */}
                  {isSignedIn ? (
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 text-lg font-medium hover:text-primary transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      {user?.name ?? "我的仪表盘"}
                    </Link>
                  ) : (
                    <Link
                      href="/login"
                      className="flex items-center gap-2 text-lg font-medium hover:text-primary transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      <LogIn className="size-5" />
                      登录
                    </Link>
                  )}
                  <Separator />
                  <Button
                    asChild
                    size="lg"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Link href="/resume/new">开始制作</Link>
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="px-4 pt-24 pb-16 text-center">
          <motion.h1
            className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
            {...fadeUp}
          >
            做出专业简历
            <br />
            <span className="text-primary">拿下心仪 Offer</span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-lg text-muted-foreground text-lg leading-relaxed"
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          >
            在线简历工具 — 分步填写、多模板预览、一键导出
            PDF，配合投递看板追踪每次机会。
          </motion.p>
          <motion.div
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          >
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/resume/new">
                立即制作简历 <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              分步引导 · 实时预览 · 多模板切换
            </p>
          </motion.div>
        </section>

        {/* How It Works */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <motion.h2 className="text-center text-2xl font-semibold" {...fadeUp}>
            三步做出专业简历
          </motion.h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((s, i) => (
              <motion.div
                key={s.step}
                className="relative text-center"
                {...fadeUp}
                transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
              >
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <s.icon className="size-6" />
                </div>
                {i < steps.length - 1 && (
                  <div className="absolute top-7 left-[60%] hidden w-[80%] border-t-2 border-dashed border-border sm:block" />
                )}
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <Separator className="mx-auto max-w-6xl" />

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div {...fadeUp}>
              <h2 className="text-2xl font-semibold sm:text-3xl">
                不只做简历，
                <br />
                更帮你管理求职全程
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                从简历版本管理到投递状态追踪，一个工具覆盖求职全流程，不再用
                Excel 到处记。
              </p>
            </motion.div>
            <div className="space-y-4">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  {...fadeUp}
                  transition={{
                    duration: 0.5,
                    delay: i * 0.12,
                    ease: "easeOut",
                  }}
                >
                  <Card className="border-border/60">
                    <CardContent className="flex items-start gap-4 p-5">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <f.icon className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{f.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {f.desc}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="bg-muted/50 px-4 py-20 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-2xl font-semibold sm:text-3xl">
              准备好拿下心仪 Offer 了吗？
            </h2>
            <p className="mt-3 text-muted-foreground">
              基础功能永久免费，高级模板按需解锁。
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/resume/new">
                开始制作简历 <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>
          Resume Go Offer &copy; {new Date().getFullYear()} — 跑在 Cloudflare
          Pages 上
        </p>
      </footer>
    </div>
  );
}
