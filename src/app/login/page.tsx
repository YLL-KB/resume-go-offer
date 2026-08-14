/**
 * /login 路由
 *
 * GitHub OAuth 登录
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isSignedIn) {
      router.push("/");
    }
  }, [isSignedIn, isLoading, router]);

  if (isLoading || isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)" }}>
        <Loader2 className="size-8 animate-spin text-slate-300" />
      </div>
    );
  }

  const handleGitHubLogin = () => {
    window.location.href = "/api/auth/github/authorize";
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f0fdf4)" }}>
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">欢迎回来</h1>
          <p className="mt-2 text-sm text-slate-500">使用 GitHub 账号登录 Resume Go Offer</p>
        </div>

        <Button
          onClick={handleGitHubLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl border-0 bg-gradient-to-r from-gray-700 to-gray-900 py-3.5 text-white font-medium transition-all duration-200 hover:from-gray-600 hover:to-gray-800 active:scale-[0.98] h-auto"
          style={{ boxShadow: "0 0 20px rgba(107,114,128,0.3)" }}
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          GitHub 登录
        </Button>
      </div>
    </div>
  );
}
