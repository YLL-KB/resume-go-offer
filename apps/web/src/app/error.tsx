"use client";

import { useEffect } from "react";
import { Button } from "@resume/ui";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("页面异常:", error);
    // Sentry 上报（仅 DSN 配置时生效）
    import("@sentry/nextjs").then((Sentry) => {
      Sentry.captureException(error);
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <AlertTriangle className="mx-auto size-12 text-amber-500 mb-4" />
        <h1 className="text-xl font-semibold text-slate-900 mb-2">页面出错了</h1>
        <p className="text-sm text-slate-500 mb-6 max-w-md">
          遇到未知错误，请刷新重试。如果问题持续，请联系我们。
        </p>
        <Button onClick={reset}>
          <RefreshCw className="size-4 mr-1" />
          刷新页面
        </Button>
      </div>
    </div>
  );
}
