"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** 当前高亮的页面: "analyze" | "templates" */
  active?: "analyze" | "templates";
}

const links = [
  { href: "/analyze", label: "简历分析", key: "analyze" },
  { href: "/templates", label: "选择模版", key: "templates" },
] as const;

export function AppHeader({ active }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <FileText className="size-5" />
          Resume Go Offer
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`transition-colors ${
                active === l.key
                  ? "text-foreground font-medium"
                  : "hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Button asChild size="sm">
            <Link href="/resume/new">开始制作</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
