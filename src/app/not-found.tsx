import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <FileQuestion className="mx-auto size-12 text-slate-400 mb-4" />
        <h1 className="text-xl font-semibold text-slate-900 mb-2">页面不存在</h1>
        <p className="text-sm text-slate-500 mb-6">
          您访问的页面可能已被移动、删除或从未存在。
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="size-4 mr-1" />
              返回首页
            </Link>
          </Button>
          <Button asChild>
            <Link href="/chat">开始对话</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
