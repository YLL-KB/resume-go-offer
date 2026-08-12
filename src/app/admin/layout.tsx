"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldOff, ArrowLeft, Users, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/ui/app-header";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    // 验证是否管理员
    fetch("/api/admin/users")
      .then((res) => {
        setIsAdmin(res.ok);
      })
      .catch(() => setIsAdmin(false));
  }, [isSignedIn, isLoading, router]);

  if (isLoading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-6 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <div className="flex flex-col items-center justify-center py-32">
          <ShieldOff className="size-16 text-slate-300 mb-4" />
          <h1 className="text-xl font-bold text-slate-700 mb-2">无权限访问</h1>
          <p className="text-sm text-slate-500 mb-6">你不是管理员，无法访问管理后台</p>
          <Button asChild>
            <Link href="/chat">
              <ArrowLeft className="size-4 mr-1" />返回首页
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/admin", label: "用户管理", icon: Users },
    { href: "/admin/logs", label: "请求监控", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-gray-200/60 bg-white/60 backdrop-blur-xl min-h-[calc(100vh-52px)] pt-4 px-3 gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                )}
              >
                <item.icon className="size-4 inline mr-2" />
                {item.label}
              </Link>
            );
          })}
        </aside>
        {/* Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
