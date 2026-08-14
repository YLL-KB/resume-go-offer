export default function ChatLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1">
          <span className="size-2.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="size-2.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="size-2.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="text-sm text-slate-400">加载对话中...</p>
      </div>
    </div>
  );
}
