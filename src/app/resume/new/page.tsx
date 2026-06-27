"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useRequest } from "ahooks";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Save,
  Download,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { ModuleList } from "@/components/editor/ModuleList";
import {
  getTemplates,
  parseResumeText,
  fillTemplatePdf,
} from "@/lib/api/templates";
import { createResume, updateResume } from "@/lib/api/resume";
import type { TemplateItem, ParsedSection } from "@/lib/api/templates";
import type { TextBlock } from "@/components/preview/ClickablePdfView";
import type { ResumeData } from "@/lib/validators/resume.schema";
import { detectModules, getModuleByBlockIndex, getModuleBlockIndices } from "@/lib/pdf/module-detector";
import type { Module } from "@/lib/pdf/module-detector";
import { buildModuleHtml, parseModuleHtml } from "@/lib/editor/html-parser";
import { SAMPLE_RESUME_DATA } from "./sample-data";

// ── ClickablePdfView 动态导入 ──
const ClickablePdfView = dynamic(
  () =>
    import("@/components/preview/ClickablePdfView").then(
      (m) => m.ClickablePdfView,
    ),
  { ssr: false },
);

// ── 从 PDF 提取原始文本 ──
async function extractPdfText(url: string): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: unknown) => (item as { str?: string }).str ?? "")
      .filter((s) => s.trim())
      .join(" ");
    texts.push(pageText);
  }
  return texts.join("\n").trim();
}

// ── AI 解析结果 → ResumeData ──
function parsedSectionsToResumeData(sections: ParsedSection[]): ResumeData {
  console.log("parsedSectionsToResumeData", sections);
  const basic: ResumeData["basic"] = {
    name: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    title: "",
  };
  let summary = "";
  const education: ResumeData["education"] = [];
  const experience: ResumeData["experience"] = [];
  const projects: ResumeData["projects"] = [];
  const skills: string[] = [];

  for (const sec of sections) {
    switch (sec.type) {
      case "fields": {
        for (const f of sec.fields ?? []) {
          const k = f.key.toLowerCase();
          if (k in basic) (basic as Record<string, string>)[k] = f.value;
          if (k === "summary" || k === "个人总结") summary = f.value;
        }
        break;
      }
      case "textarea": {
        summary = summary || sec.content || "";
        break;
      }
      case "list": {
        const items = sec.items ?? [];
        if (items.length === 0) break;
        const firstKeys = new Set(
          items[0].fields.map((f) => f.key.toLowerCase()),
        );

        const mapItem = (item: (typeof items)[0]) => {
          const obj: Record<string, string> = {};
          for (const f of item.fields) obj[f.key.toLowerCase()] = f.value;
          return obj;
        };

        if (firstKeys.has("company") || firstKeys.has("title")) {
          for (const item of items) {
            const m = mapItem(item);
            console.log("mapItem", m);
            experience.push({
              company: m.company ?? m.公司 ?? "",
              title: m.title ?? m.职位 ?? "",
              startDate: m.startdate ?? m.period ?? m.开始时间 ?? "",
              endDate: m.enddate ?? m.结束时间 ?? "",
              description: m.description ?? m.描述 ?? "",
              highlights: [],
            });
          }
        } else if (firstKeys.has("school") || firstKeys.has("degree")) {
          for (const item of items) {
            const m = mapItem(item);
            education.push({
              school: m.school ?? m.学校 ?? "",
              degree: m.degree ?? m.学位 ?? "",
              major: m.major ?? m.专业 ?? "",
              startDate: m.startdate ?? m.开始时间 ?? "",
              endDate: m.enddate ?? m.结束时间 ?? "",
              gpa: m.gpa ?? "",
            });
          }
        } else if (firstKeys.has("name") || firstKeys.has("项目")) {
          for (const item of items) {
            const m = mapItem(item);
            projects.push({
              name: m.name ?? m.项目 ?? "",
              description: m.description ?? m.描述 ?? "",
              url: m.url ?? m.链接 ?? "",
              techStack: m.techstack ?? m.技术栈 ?? "",
              highlights: [],
            });
          }
        } else {
          for (const item of items) {
            for (const f of item.fields) {
              if (f.value) skills.push(f.value);
            }
          }
        }
        break;
      }
    }
  }

  return { basic, summary, education, experience, projects, skills };
}

// ───────────────────────────────────────────────
// Content
// ───────────────────────────────────────────────

function ResumeNewContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template") ?? undefined;

  const [resumeData, setResumeData] = useState<ResumeData>(SAMPLE_RESUME_DATA);
  const [parsing, setParsing] = useState(false);
  const [modules, setModules] = useState<Module[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [editedModules, setEditedModules] = useState<Record<string, string>>({});
  const [filledPdfUrl, setFilledPdfUrl] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 保持初始模版信息，避免 filled PDF 重新提取后覆盖
  const templateBlocksRef = useRef<TextBlock[]>([]);
  const templateModulesRef = useRef<Module[]>([]);
  const templateCaptured = useRef(false);

  const { data: uploadedTemplates = [] } = useRequest(getTemplates);

  const uploadedTemplate: TemplateItem | undefined = templateId
    ? uploadedTemplates.find((t) => t.id === templateId)
    : undefined;

  const pdfUrl = uploadedTemplate
    ? `/uploads/templates/${uploadedTemplate.id}.pdf`
    : undefined;

  const hasPdf = !!pdfUrl;

  // ── 当前激活的模块 ──
  const activeModule = useMemo(() => {
    if (!activeModuleId) return null;
    return modules.find((m) => m.id === activeModuleId) ?? null;
  }, [activeModuleId, modules]);

  // ── 当前模块内所有 block 的 globalIndex 集合 ──
  const activeBlockIndices = useMemo(
    () => getModuleBlockIndices(activeModule),
    [activeModule],
  );

  // ── 已编辑的模块 ID 集合 ──
  const editedModuleIds = useMemo(() => {
    return new Set(Object.keys(editedModules));
  }, [editedModules]);

  // ── 当前模块的编辑 HTML ──
  const activeModuleHtml = useMemo(() => {
    if (!activeModule) return "";
    if (editedModules[activeModule.id] != null) {
      return editedModules[activeModule.id];
    }
    return buildModuleHtml(activeModule.blocks);
  }, [activeModule, editedModules]);

  // ── 上传模版 → 提取文本 → AI 解析 ──
  useEffect(() => {
    templateBlocksRef.current = [];
    templateModulesRef.current = [];
    templateCaptured.current = false;

    if (!pdfUrl) {
      queueMicrotask(() => {
        setResumeData(SAMPLE_RESUME_DATA);
        setModules([]);
        setActiveModuleId(null);
        setEditedModules({});
        setFilledPdfUrl(null);
      });
      return;
    }

    queueMicrotask(() => {
      setModules([]);
      setEditedModules({});
      setActiveModuleId(null);
      setFilledPdfUrl(null);
    });

    let cancelled = false;

    const run = async () => {
      setParsing(true);
      try {
        const text = await extractPdfText(pdfUrl);
        if (cancelled || text.length === 0) return;
        const parsed = await parseResumeText(text);
        if (cancelled) return;
        setResumeData(parsedSectionsToResumeData(parsed.sections));
      } catch {
        if (!cancelled) {
          setResumeData(SAMPLE_RESUME_DATA);
        }
      } finally {
        if (!cancelled) setParsing(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // ── 首次提取文本块时捕获为模版 ──
  const handleBlocksExtracted = useCallback((blocks: TextBlock[]) => {
    console.log("[handleBlocksExtracted] blocks:", blocks.length, "captured:", templateCaptured.current);

    if (!templateCaptured.current && blocks.length > 0) {
      const mods = detectModules(blocks);
      templateBlocksRef.current = blocks;
      templateModulesRef.current = mods;
      templateCaptured.current = true;
      console.log("[handleBlocksExtracted] 模版已捕获: blocks", blocks.length, "modules", mods.length);
    }

    // 每次提取后重新检测模块（因为 filled PDF 会重新提取）
    const mods = detectModules(blocks);
    setModules(mods);
  }, []);

  // ── 点击 PDF 文字块 → 选中对应模块 ──
  const handleBlockClick = useCallback(
    (block: TextBlock) => {
      const mod = getModuleByBlockIndex(modules, block.globalIndex);
      if (mod) {
        setActiveModuleId(mod.id);
      }
    },
    [modules],
  );

  // ── 从模块列表选中 ──
  const handleModuleSelect = useCallback((moduleId: string) => {
    setActiveModuleId(moduleId);
  }, []);

  // ── 编辑器内容变更 ──
  const handleModuleTextChange = useCallback(
    (html: string) => {
      if (!activeModuleId) return;
      setEditedModules((prev) => ({ ...prev, [activeModuleId]: html }));
    },
    [activeModuleId],
  );

  // ── 保存 ──
  const handleSave = useCallback(async () => {
    console.log("[handleSave] 开始保存...");
    setSaving(true);
    setSaved(false);
    try {
      // 数据库保存（失败不阻塞 PDF 填充）
      try {
        if (resumeId) {
          const updateResumeData = await updateResume(resumeId, resumeData);
          console.log("updateResumeData", updateResumeData);
        } else {
          const created = await createResume({
            title: uploadedTemplate?.name ?? "未命名简历",
            templateId: templateId ?? "classic",
            data: resumeData,
          });
          setResumeId(created.id);
        }
      } catch (dbErr) {
        console.warn("数据库保存失败（不影响 PDF 填充）:", dbErr);
      }

      if (!uploadedTemplate) return;

      const templateModules = templateModulesRef.current;
      const templateBlocks = templateBlocksRef.current;
      if (templateBlocks.length === 0) {
        console.warn("尚未提取文本块，请等待 PDF 加载完成");
        return;
      }

      const editedModIds = Object.keys(editedModules);
      if (editedModIds.length === 0) {
        console.warn("没有编辑任何模块");
        return;
      }

      // 收集所有编辑过的 block
      const allPayloadBlocks: {
        x: number; y: number; width: number; height: number;
        text: string; page: number; globalIndex: number;
        fontSize?: number; textIndent?: boolean;
      }[] = [];

      for (const modId of editedModIds) {
        const mod = templateModules.find((m) => m.id === modId);
        if (!mod) {
          console.warn("找不到模版模块:", modId);
          continue;
        }

        const html = editedModules[modId];
        if (!html) continue;

        try {
          const blockData = parseModuleHtml(html, mod.blocks.length);
          for (let i = 0; i < mod.blocks.length; i++) {
            const block = mod.blocks[i];
            const data = blockData[i];
            allPayloadBlocks.push({
              x: block.x,
              y: block.y,
              width: block.width,
              height: block.height,
              text: data.text,
              page: block.page,
              globalIndex: block.globalIndex,
              fontSize: data.fontSize ?? undefined,
              textIndent: data.textIndent || undefined,
            });
          }
        } catch (parseErr) {
          console.error("模块解析失败:", mod.label, parseErr);
          alert(`模块"${mod.label}"：${parseErr instanceof Error ? parseErr.message : "解析失败"}`);
          setSaving(false);
          return;
        }
      }

      console.log("[handleSave] payload blocks:", allPayloadBlocks.length);

      const result = await fillTemplatePdf(
        uploadedTemplate.id,
        allPayloadBlocks as unknown as Record<string, unknown>[],
      );
      console.log("[handleSave] fillTemplatePdf 返回:", result);

      setFilledPdfUrl(result.url);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("保存失败:", err);
    } finally {
      setSaving(false);
    }
  }, [resumeId, resumeData, templateId, uploadedTemplate, editedModules]);

  return (
    <div className="h-dvh flex flex-col bg-background">
      {/* ── Top bar ── */}
      <header className="shrink-0 flex items-center gap-3 border-b px-4 h-12">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/templates" className="flex items-center gap-1.5">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">返回模版</span>
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate flex items-center gap-1.5 flex-1">
          <FileText className="size-3.5" />
          {uploadedTemplate
            ? `简历编辑 — ${uploadedTemplate.name}`
            : "简历编辑"}
        </span>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || parsing}
          className="shrink-0 gap-1.5"
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              保存中...
            </>
          ) : saved ? (
            <>
              <Check className="size-3.5" />
              已保存 & 已同步
            </>
          ) : (
            <>
              <Save className="size-3.5" />
              保存 & 同步到 PDF
            </>
          )}
        </Button>

        {filledPdfUrl && (
          <Button size="sm" variant="outline" asChild className="shrink-0 gap-1.5">
            <a
              href={filledPdfUrl}
              download={`${uploadedTemplate?.name ?? "resume"}.pdf`}
            >
              <Download className="size-3.5" />
              下载 PDF
            </a>
          </Button>
        )}
      </header>

      {/* ── 3-column body ── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 min-h-0">
        {/* ─────── 左侧：模块列表 ─────── */}
        <section className="hidden md:flex flex-col border-r bg-background min-h-0 md:col-span-1">
          <ModuleList
            modules={modules}
            activeModuleId={activeModuleId}
            editedModuleIds={editedModuleIds}
            onSelectModule={handleModuleSelect}
          />
        </section>

        {/* ─────── 中间：模块编辑 ─────── */}
        <section className="hidden md:flex flex-col border-r bg-background min-h-0 md:col-span-2">
          {parsing ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-xs">AI 解析简历内容...</p>
            </div>
          ) : activeModule ? (
            <div className="flex flex-col h-full">
              <div className="shrink-0 px-4 py-2 border-b flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold truncate">
                  {activeModule.label}
                </h3>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {activeModule.blocks.length} 个文字块
                </span>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <RichTextEditor
                  value={activeModuleHtml}
                  onChange={handleModuleTextChange}
                  placeholder="编辑此模块的内容..."
                  minHeight="200px"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground/40">
              <FileText className="size-10" />
              <p className="text-sm text-center">
                {hasPdf ? "点击 PDF 中的文字或左侧模块开始编辑" : "请先选择模版"}
              </p>
            </div>
          )}
        </section>

        {/* ─────── 右侧：PDF ─────── */}
        <section className="col-span-1 md:col-span-2 overflow-auto bg-muted/30 flex flex-col">
          <div className="flex-1 py-4">
            {hasPdf ? (
              <ClickablePdfView
                url={filledPdfUrl ?? pdfUrl!}
                activeBlockIndices={activeBlockIndices}
                onBlockClick={handleBlockClick}
                onBlocksExtracted={handleBlocksExtracted}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                请选择模版
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────

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
