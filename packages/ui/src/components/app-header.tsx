"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, LogIn, MessageSquare, ClipboardList, LogOut, Loader2, Menu, X, Settings2, HelpCircle, Mail } from "lucide-react";
import { Button } from "./button";
import { Avatar, AvatarImage, AvatarFallback } from "./avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./dropdown-menu";
import { Separator } from "./separator";
import { useAuth } from "../hooks/use-auth";
import { cn } from "../lib/utils";

const links = [
  { href: "/chat", label: "AI 对话", icon: MessageSquare },
  { href: "/resume/list", label: "我的简历", icon: FileText },
  { href: "/applications", label: "投递追踪", icon: ClipboardList },
  { href: "/settings", label: "设置", icon: Settings2 },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isSignedIn, isLoading } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/auth/logout";
  };

  const userInitial = user?.name?.charAt(0) ?? "U";

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
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-slate-300" />
          ) : isSignedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100/60 rounded-full pl-2 pr-3 h-auto py-1">
                  <Avatar className="size-7">
                    <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name ?? ""} />
                    <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{user?.name ?? "我的"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => router.push("/resume/list")} className="gap-2 cursor-pointer">
                  <FileText className="size-4" />我的简历
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/applications")} className="gap-2 cursor-pointer">
                  <ClipboardList className="size-4" />投递追踪
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <HelpCircle className="size-4" />有问题请联系
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent sideOffset={8} className="p-1">
                    <a
                      href="mailto:3263815680@qq.com"
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-slate-600 hover:bg-accent hover:text-accent-foreground"
                    >
                      <Mail className="size-4 shrink-0" />
                      3263815680@qq.com
                    </a>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="gap-2 cursor-pointer text-red-500">
                  <LogOut className="size-4" />退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

    {/* ── 移动端汉堡菜单 ── */}
    <input type="checkbox" id="mobile-menu-toggle" className="peer hidden" />
    <label
      htmlFor="mobile-menu-toggle"
      className="fixed top-3 right-3 z-[60] sm:hidden inline-flex items-center justify-center rounded-md h-10 w-10 bg-white/90 shadow backdrop-blur text-slate-500 cursor-pointer"
    >
      <Menu className="size-5 pointer-events-none" />
    </label>
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

          {!isLoading && (
            <>
              <Separator className="my-2 bg-gray-200" />
              {isSignedIn ? (
                <>
                  <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                    <Avatar className="size-8">
                      <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name ?? ""} />
                      <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-base font-medium text-slate-900">{user?.name ?? "我的"}</span>
                  </div>
                  <Link
                    href="/resume/list"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <FileText className="size-5" />我的简历
                  </Link>
                  <Link
                    href="/applications"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <ClipboardList className="size-5" />投递追踪
                  </Link>
                  <a
                    href="mailto:3263815680@qq.com"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <HelpCircle className="size-5" />有问题请联系
                  </a>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="size-5" />退出登录
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  <LogIn className="size-5" />
                  登录
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </div>
    </>
  );
}
