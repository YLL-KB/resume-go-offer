import { Suspense } from "react";
import { ResumeNewContent } from "./ResumeNewContent";

export default function ResumeNewPage() {
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
