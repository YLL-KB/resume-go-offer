/**
 * /login 路由
 *
 * 支持两种登录方式：
 *   微信扫码登录（直接对接微信开放平台）
 *   手机号/邮箱登录（通过 Authing）
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
      router.push("/chat");
    }
  }, [isSignedIn, isLoading, router]);

  if (isLoading || isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)" }}>
        <Loader2 className="size-8 animate-spin text-slate-300" />
      </div>
    );
  }

  const handleWechatLogin = () => {
    window.location.href = "/api/auth/wechat/login";
  };

  const handleAuthingLogin = () => {
    window.location.href = "/api/auth/login";
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)" }}>
      <div className="w-full max-w-sm space-y-8">
        {/* 标题 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">欢迎回来</h1>
          <p className="mt-2 text-sm text-slate-500">选择一种方式登录 Resume Go Offer</p>
        </div>

        {/* 登录选项 */}
        <div className="space-y-3">
          {/* 微信扫码登录 */}
          <button
            onClick={handleWechatLogin}
            className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-gradient-to-r from-green-500 to-emerald-500 py-3.5 text-white font-medium transition-all duration-200 hover:from-green-400 hover:to-emerald-400 active:scale-[0.98]"
            style={{ boxShadow: "0 0 20px rgba(34,197,94,0.25)" }}
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.741 2.04 2.26 3.073 3.841 3.602.73.244 1.517.294 2.278.078l1.45.849a.327.327 0 0 0 .168.054c.163 0 .29-.132.29-.295 0-.072-.026-.14-.048-.212l-.337-1.28a.576.576 0 0 1 .175-.657c1.436-1.063 2.353-2.62 2.353-4.352 0-3.116-2.532-5.727-5.11-5.793zm-2.682 2.318c.53 0 .96.439.96.98a.97.97 0 0 1-.96.981.97.97 0 0 1-.96-.98c0-.542.43-.981.96-.981zm3.846 0c.53 0 .96.439.96.98a.97.97 0 0 1-.96.981.97.97 0 0 1-.96-.98c0-.542.43-.981.96-.981z"/>
            </svg>
            微信扫码登录
          </button>

          {/* 分隔 */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-slate-400">或</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* 手机号/邮箱登录 */}
          <button
            onClick={handleAuthingLogin}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/70 backdrop-blur-xl py-3.5 text-slate-700 font-medium transition-all duration-200 hover:bg-white hover:border-gray-300 active:scale-[0.98]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            手机号 / 邮箱登录
          </button>
        </div>
      </div>
    </div>
  );
}
