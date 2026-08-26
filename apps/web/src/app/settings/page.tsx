import { AppHeader } from "@resume/ui";
import { ModelSettingsPanel } from "@/components/settings/ModelSettingsPanel";
import { UsagePanel } from "@/components/settings/UsagePanel";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">设置</h1>
          <p className="mt-1 text-sm text-slate-500">管理你的模型 API 与用量</p>
        </div>
        <ModelSettingsPanel />
        <UsagePanel />
      </div>
    </div>
  );
}
