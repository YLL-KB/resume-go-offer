/**
 * /login 路由
 *
 * 接入 Authing 托管登录页：
 *   已登录 → 重定向到 /dashboard
 *   未登录 → 完整页面跳转到 /api/auth/login（Authing 托管登录页）
 *   未配置 → /api/auth/login 会显示配置指引
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (isSignedIn) {
      router.push("/dashboard");
      return;
    }

    // 用浏览器原生跳转（不用 router.push），
    // 因为 /api/auth/login 可能返回 HTML（配置指引）或 302 重定向
    window.location.href = "/api/auth/login";
  }, [isSignedIn, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">正在跳转到登录页...</p>
      </div>
    </div>
  );
}
