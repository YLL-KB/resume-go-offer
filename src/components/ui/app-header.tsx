"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Menu, LogIn, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const links = [
  { href: "/chat", label: "AI 对话", icon: MessageSquare },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isSignedIn } = useAuth();

  return (
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
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full -z-10 bg-emerald-50"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
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

        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="sm:hidden">
            <Button variant="ghost" size="icon" className="relative text-slate-500">
              <Menu className="size-5" />
              <span className="sr-only">打开菜单</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 pt-14 border-gray-200 bg-white/95 backdrop-blur-xl">
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
                    onClick={() => setMobileOpen(false)}
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
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="size-5" />
                  {user?.name ?? "我的"}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <LogIn className="size-5" />
                  登录
                </Link>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
