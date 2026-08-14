"use client";

import Link from "next/link";
import { ExternalLink, LogOut, Loader2, FileText } from "lucide-react";
import { Button } from "@resume/ui";
import { Avatar, AvatarImage, AvatarFallback } from "@resume/ui";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@resume/ui";
import { useAuth } from "@resume/ui";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export function AdminHeader() {
  const { user, isSignedIn, isLoading } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/auth/logout";
  };

  const userInitial = user?.name?.charAt(0) ?? "U";

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/60 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg shrink-0 text-slate-900">
            <div className="flex size-8 items-center justify-center rounded-lg text-white bg-gradient-to-br from-emerald-500 to-teal-500">
              <FileText className="size-4" />
            </div>
            管理后台
          </Link>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={WEB_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4 mr-1" />
              返回前台
            </a>
          </Button>
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-slate-300" />
          ) : isSignedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100/60 rounded-full pl-2 pr-3 h-auto py-1"
                >
                  <Avatar className="size-7">
                    <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name ?? ""} />
                    <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{user?.name ?? "管理员"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={handleLogout} className="gap-2 cursor-pointer text-red-500">
                  <LogOut className="size-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
