"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Menu, LogIn, User, MessageSquare, ClipboardList, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const links = [
  { href: "/chat", label: "AI 对话", icon: MessageSquare },
  { href: "/resume/list", label: "我的简历", icon: FileText },
  { href: "/applications", label: "投递追踪", icon: ClipboardList },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const { user, isSignedIn } = useAuth();

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-gray-200/60 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg shrink-0 text-slate-900">
          <div className="flex size-8 items-center justify-center rounded-lg text-white bg-gradient-to-br from-emerald-500 to-teal-500">
            <FileText className="size-4" />
          </div>
          Resume Go Offer
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((l) => {
            const isActive = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "text-emerald-700 bg-emerald-50"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60",
                )}
              >
                <l.icon className="size-3.5" />
                {l.label}
                {isActive && (
                  <div className="absolute inset-0 rounded-full -z-10 bg-emerald-50" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop auth */}
        <div className="hidden items-center gap-2 sm:flex shrink-0">
          {isSignedIn ? (
            <Button variant="ghost" size="sm" asChild className="text-slate-500 hover:text-slate-900 hover:bg-slate-100/60">
              <Link href="/chat" className="gap-1.5">
                <User className="size-4" />
                {user?.name ?? "我的"}
              </Link>
            </Button>
          ) : (
            <Button size="sm" asChild className="shadow-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 border-0">
              <Link href="/login">
                <LogIn className="size-4" />
                登录
              </Link>
            </Button>
          )}
        </div>

      </div>
    </header>

    {/* ── CSS-only 移动端汉堡菜单（零 JS 依赖）── */}
    <input type="checkbox" id="mobile-menu-toggle" className="peer hidden" />
    {/* 汉堡按钮 — label 触发 checkbox */}
    <label
      htmlFor="mobile-menu-toggle"
      className="fixed top-3 right-3 z-[60] sm:hidden inline-flex items-center justify-center rounded-md h-10 w-10 bg-white/90 shadow backdrop-blur text-slate-500 cursor-pointer"
    >
      <Menu className="size-5 pointer-events-none" />
    </label>
    {/* 菜单面板 */}
    <div className="fixed inset-0 z-50 hidden peer-checked:block sm:hidden">
      <label htmlFor="mobile-menu-toggle" className="absolute inset-0 bg-black/30 cursor-pointer" />
      <div className="absolute right-0 top-0 bottom-0 w-64 bg-white/95 backdrop-blur-xl pt-14 px-6 border-l border-gray-200 shadow-lg">
        <label htmlFor="mobile-menu-toggle" className="absolute right-4 top-4 size-7 inline-flex items-center justify-center rounded-md hover:bg-accent cursor-pointer">
          <X className="size-4" />
        </label>
        <nav className="flex flex-col gap-2">
          {links.map((l) => {
            const isActive = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <l.icon className="size-5" />
                {l.label}
              </Link>
            );
          })}
          <Separator className="my-2 bg-gray-200" />
          {isSignedIn ? (
            <Link
              href="/chat"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <User className="size-5" />
              {user?.name ?? "我的"}
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              <LogIn className="size-5" />
              登录
            </Link>
          )}
        </nav>
      </div>
    </div>
    </>
  );
}
