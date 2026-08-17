"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldOff, ShieldCheck, Users, Activity, Workflow } from "lucide-react";
import { Button } from "@resume/ui";
import { useAuth } from "@resume/ui";
import { cn } from "@resume/ui";
import { AdminHeader } from "@/components/admin-header";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading } = useAuth();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSignedIn) {
      window.location.href = `${WEB_URL}/login`;
      return;
    }
    fetch("/api/admin/me")
      .then(async (res) => {
        if (!res.ok) {
          setIsAdmin(false);
          setPermissions([]);
          return;
        }
        const data = (await res.json()) as { permissions?: string[] };
        setIsAdmin(true);
        setPermissions(data.permissions ?? []);
      })
      .catch(() => {
        setIsAdmin(false);
        setPermissions([]);
      });
  }, [isSignedIn, isLoading]);

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
        <AdminHeader />
        <div className="flex flex-col items-center justify-center py-32">
          <ShieldOff className="size-16 text-slate-300 mb-4" />
          <h1 className="text-xl font-bold text-slate-700 mb-2">无权限访问</h1>
          <p className="text-sm text-slate-500 mb-6">你不是管理员，无法访问管理后台</p>
          <Button asChild>
            <Link href={WEB_URL}>返回前台</Link>
          </Button>
        </div>
      </div>
    );
  }

  const hasPerm = (key: string) => permissions.includes("*") || permissions.includes(key);

  const navItems = [
    { href: "/", label: "用户管理", icon: Users, perm: "" },
    { href: "/logs", label: "请求监控", icon: Activity, perm: "admin.logs" },
    { href: "/traces", label: "AI Traces", icon: Workflow, perm: "admin.traces" },
    { href: "/permissions", label: "权限管理", icon: ShieldCheck, perm: "admin.permissions" },
  ].filter((item) => item.perm === "" || hasPerm(item.perm));

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <div className="flex">
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
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
