"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TemplateClassic } from "@/components/resume/TemplateClassic";
import { ResumeData } from "@/lib/validators/resume.schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Edit, Printer } from "lucide-react";

export default function ResumePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<ResumeData | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/resume/${id}`);
        if (!res.ok) throw new Error("简历不存在或无法加载");
        const row: { data: ResumeData; title: string } = await res.json();
        setData(row.data);
        setTitle(row.title);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="w-full max-w-[210mm] space-y-4 p-8">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton className="h-32 w-full mt-6" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive text-lg">{error || "简历加载失败"}</p>
        <Button variant="outline" onClick={() => router.back()}>
          返回上一页
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* 顶部工具栏 */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b bg-background/95 backdrop-blur px-4 py-2.5 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            返回
          </button>
          <span className="text-sm font-medium">{title || "简历预览"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 size-4" />
            打印
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/resume/${id}/edit`}>
              <Edit className="mr-1.5 size-4" />
              编辑
            </Link>
          </Button>
        </div>
      </div>

      {/* A4 预览内容 */}
      <div className="mx-auto py-8 px-4 print:p-0 print:py-0 max-w-[210mm]">
        <TemplateClassic data={data} />
      </div>
    </div>
  );
}
