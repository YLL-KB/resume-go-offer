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
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-lg shrink-0"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="size-4" />
          </div>
          Resume Go Offer
        </Link>

        {/* ── Desktop nav: 胶囊 Tab ── */}
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
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <l.icon className="size-3.5" />
                {l.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-muted -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Desktop auth ── */}
        <div className="hidden items-center gap-2 sm:flex shrink-0">
          {isSignedIn ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard" className="gap-1.5">
                <User className="size-4" />
                {user?.name ?? "我的"}
              </Link>
            </Button>
          ) : (
            <Button size="sm" asChild className="shadow-sm">
              <Link href="/login">
                <LogIn className="size-4" />
                登录
              </Link>
            </Button>
          )}
        </div>

        {/* ── Mobile menu ── */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="sm:hidden">
            <Button variant="ghost" size="icon" className="relative">
              <Menu className="size-5" />
              <span className="sr-only">打开菜单</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 pt-14">
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
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => setMobileOpen(false)}
                  >
                    <l.icon className="size-5" />
                    {l.label}
                  </Link>
                );
              })}
              <Separator className="my-2" />
              {isSignedIn ? (
                <Link
                  href="/dashboard"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="size-5" />
                  {user?.name ?? "我的仪表盘"}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-primary hover:bg-primary/10 transition-colors"
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
