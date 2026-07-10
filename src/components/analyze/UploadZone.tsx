"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 cursor-pointer min-h-[420px] flex flex-col items-center justify-center",
          dragOver ? "border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/30",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--primary)/.06,transparent_70%)]" />
        <div className="relative space-y-4">
          <motion.div animate={dragOver ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }} className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
            <Upload className="size-7 text-primary" />
          </motion.div>
          <div>
            <p className="text-base font-semibold">{dragOver ? "松开即可上传" : "拖拽简历到此处"}</p>
            <p className="mt-1 text-sm text-muted-foreground">或点击选择文件</p>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground/70">
            <Badge variant="secondary" className="font-normal">PDF</Badge>
            <Badge variant="secondary" className="font-normal">Word</Badge>
            <Badge variant="secondary" className="font-normal">TXT</Badge>
            <span className="tabular-nums">≤ 10MB</span>
          </div>
        </div>
        <input id="file-input" type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </div>
    </motion.div>
  );
}
