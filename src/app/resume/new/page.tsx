"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
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
  Check,
  User,
  Briefcase,
  FolderGit2,
  GraduationCap,
  Wrench,
  Sparkles,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { getTemplates, parseResumeText, fillTemplatePdf } from "@/lib/api/templates";
import { createResume, updateResume } from "@/lib/api/resume";
import type { TemplateItem, TemplateSection, ParsedSection } from "@/lib/api/templates";
import type { TextBlock } from "@/components/preview/ClickablePdfView";
import type { ResumeData } from "@/lib/validators/resume.schema";
import { SAMPLE_RESUME_DATA } from "./sample-data";

// ── ClickablePdfView 动态导入 ──
const ClickablePdfView = dynamic(
  () => import("@/components/preview/ClickablePdfView").then((m) => m.ClickablePdfView),
  { ssr: false },
);

// ── 模块类型 → 颜色 & 图标 ──
const SECTION_META: Record<string, { color: string; icon: typeof User }> = {
  header: { color: "bg-blue-400", icon: User },
  summary: { color: "bg-purple-400", icon: Sparkles },
  experience: { color: "bg-emerald-400", icon: Briefcase },
  projects: { color: "bg-orange-400", icon: FolderGit2 },
  education: { color: "bg-amber-400", icon: GraduationCap },
  skills: { color: "bg-pink-400", icon: Wrench },
  certificates: { color: "bg-teal-400", icon: FileText },
};

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
  const basic: ResumeData["basic"] = {
    name: "", email: "", phone: "", location: "", website: "", title: "",
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
        const firstKeys = new Set(items[0].fields.map((f) => f.key.toLowerCase()));

        const mapItem = (item: (typeof items)[0]) => {
          const obj: Record<string, string> = {};
          for (const f of item.fields) obj[f.key.toLowerCase()] = f.value;
          return obj;
        };

        if (firstKeys.has("company") || firstKeys.has("title")) {
          for (const item of items) {
            const m = mapItem(item);
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

// ── AI 解析结果 → TemplateSection[] ──
function parsedSectionsToTemplateSections(
  sections: ParsedSection[],
): TemplateSection[] {
  return sections.map((sec, i) => {
    let type = "custom";
    if (sec.type === "fields") type = "header";
    else if (sec.type === "textarea") type = "summary";
    else if (sec.type === "list") {
      const keys = new Set(
        (sec.items?.[0]?.fields ?? []).map((f) => f.key.toLowerCase()),
      );
      if (keys.has("company") || keys.has("title")) type = "experience";
      else if (keys.has("school") || keys.has("degree")) type = "education";
      else if (keys.has("name") || keys.has("项目")) type = "projects";
      else type = "skills";
    }
    return {
      id: `ai-sec-${i}`,
      label: sec.title || `模块 ${i + 1}`,
      order: i,
      type,
    };
  });
}

// ── 收集一个 section 的所有文本（用于匹配）──
function getSectionFullText(sections: ParsedSection[]): { id: string; fullText: string }[] {
  return sections.map((sec, i) => {
    const parts: string[] = [sec.title];
    for (const f of sec.fields ?? []) {
      parts.push(f.label, f.value);
    }
    if (sec.content) parts.push(sec.content);
    for (const item of sec.items ?? []) {
      for (const f of item.fields) {
        parts.push(f.label, f.value);
      }
    }
    return { id: `ai-sec-${i}`, fullText: parts.join(" ").toLowerCase() };
  });
}

// ── 根据点击的 TextBlock 匹配到 AI parsed section ──
function matchBlockToSection(
  block: TextBlock,
  sections: ParsedSection[],
): string | null {
  if (sections.length === 0) return null;

  const sectionTexts = getSectionFullText(sections);
  const blockText = block.text.toLowerCase();

  // 分词：中英文混合，按空格和标点拆
  const tokens = blockText
    .split(/[\s,，、。：:；;（）()【】\[\]\/\\·]+/)
    .filter((t) => t.length >= 1);

  let bestId: string | null = null;
  let bestScore = 0;

  for (const { id, fullText } of sectionTexts) {
    let score = 0;
    for (const token of tokens) {
      // 子串匹配
      if (fullText.includes(token)) score += token.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  // 至少匹配 1 个非数字 token
  return tokens.some((t) => /\D/.test(t)) && bestScore > 0 ? bestId : null;
}

// ───────────────────────────────────────────────
// Content
// ───────────────────────────────────────────────

function ResumeNewContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template") ?? undefined;

  const [resumeData, setResumeData] = useState<ResumeData>(SAMPLE_RESUME_DATA);
  const [parsedSections, setParsedSections] = useState<ParsedSection[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null);
  const [filledPdfUrl, setFilledPdfUrl] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: uploadedTemplates = [] } = useRequest(getTemplates);

  const uploadedTemplate: TemplateItem | undefined = templateId
    ? uploadedTemplates.find((t) => t.id === templateId)
    : undefined;

  const pdfUrl = uploadedTemplate
    ? `/uploads/templates/${uploadedTemplate.id}.pdf`
    : undefined;

  const hasPdf = !!pdfUrl;

  // ── 上传模版 → 提取文本 → AI 解析 ──
  useEffect(() => {
    if (!pdfUrl) {
      queueMicrotask(() => {
        setResumeData(SAMPLE_RESUME_DATA);
        setParsedSections(null);
      });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setParsing(true);
      try {
        const text = await extractPdfText(pdfUrl);
        if (cancelled || text.length === 0) return;
        const parsed = await parseResumeText(text);
        if (cancelled) return;
        setParsedSections(parsed.sections);
        setResumeData(parsedSectionsToResumeData(parsed.sections));
      } catch {
        if (!cancelled) {
          setResumeData(SAMPLE_RESUME_DATA);
          setParsedSections(null);
        }
      } finally {
        if (!cancelled) setParsing(false);
      }
    };

    run();

    return () => { cancelled = true; };
  }, [pdfUrl]);

  // sections 列表
  const sections = useMemo(() => {
    if (parsedSections) return parsedSectionsToTemplateSections(parsedSections);
    return [];
  }, [parsedSections]);

  const sectionTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sections) map[s.id] = s.type;
    return map;
  }, [sections]);

  const activeSectionType = activeSection
    ? sectionTypeMap[activeSection] ?? ""
    : "";

  // ── 点击 PDF 文字块 → 匹配 section → 同步编辑器 ──
  const handleBlockClick = useCallback(
    (block: TextBlock, index: number) => {
      setActiveBlockIndex(index);
      if (parsedSections) {
        const secId = matchBlockToSection(block, parsedSections);
        if (secId) setActiveSection(secId);
      }
    },
    [parsedSections],
  );

  // ── 保存 ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (resumeId) {
        await updateResume(resumeId, resumeData);
      } else {
        const created = await createResume({
          title: uploadedTemplate?.name ?? "未命名简历",
          templateId: templateId ?? "classic",
          data: resumeData,
        });
        setResumeId(created.id);
      }

      if (uploadedTemplate) {
        const result = await fillTemplatePdf(
          uploadedTemplate.id,
          resumeData as unknown as Record<string, unknown>,
        );
        setFilledPdfUrl(result.url);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // silently handled
    } finally {
      setSaving(false);
    }
  }, [resumeId, resumeData, templateId, uploadedTemplate]);

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
              已保存
            </>
          ) : (
            <>
              <Save className="size-3.5" />
              保存
            </>
          )}
        </Button>
      </header>

      {/* ── 2-column body ── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 min-h-0">
        {/* ─────── 左侧：内容编辑 ─────── */}
        <section className="hidden md:flex flex-col border-r bg-background min-h-0 md:col-span-2">
          {parsing ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-xs">AI 解析简历内容...</p>
            </div>
          ) : activeSection && activeSectionType ? (
            <div className="flex flex-col h-full">
              <div className="shrink-0 px-4 py-3 border-b flex items-center gap-2">
                {(() => {
                  const meta = SECTION_META[activeSectionType] ?? {
                    color: "bg-gray-400",
                    icon: FileText,
                  };
                  const Icon = meta.icon;
                  return (
                    <>
                      <span className={`size-2.5 shrink-0 rounded-full ${meta.color}`} />
                      <Icon className="size-4 text-muted-foreground" />
                    </>
                  );
                })()}
                <h3 className="text-sm font-semibold truncate">
                  {sections.find((s) => s.id === activeSection)?.label ?? "编辑"}
                </h3>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <SectionEditor
                  sectionType={activeSectionType}
                  data={resumeData}
                  onChange={setResumeData}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground/40">
              <Pencil className="size-10" />
              <p className="text-sm text-center">
                {hasPdf
                  ? "点击 PDF 中的文字开始编辑"
                  : "请先选择模版"}
              </p>
            </div>
          )}
        </section>

        {/* ─────── 右侧：PDF ─────── */}
        <section className="col-span-1 md:col-span-3 overflow-auto bg-muted/30 flex flex-col">
          <div className="flex-1 py-4">
            {hasPdf ? (
              <ClickablePdfView
                url={filledPdfUrl ?? pdfUrl!}
                activeBlockIndex={activeBlockIndex}
                onBlockClick={handleBlockClick}
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
