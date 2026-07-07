import { Suspense } from "react";
import { ResumeNewContent } from "../new/ResumeNewContent";

export default function ResumeEditPage() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh flex items-center justify-center bg-background text-sm text-muted-foreground">
          加载中...
        </div>
      }
    >
      <ResumeNewContent />
    </Suspense>
  );
}
