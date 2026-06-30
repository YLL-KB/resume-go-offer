"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useRequest } from "ahooks";
import Link from "next/link";
import dynamic from "next/dynamic";
import NextImage from "next/image";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Save,
  Download,
  Check,
  ImageIcon,
  Upload,
  Lock,
  Unlock,
  Trash2,
  Undo2,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { ModuleList } from "@/components/editor/ModuleList";
import {
  getTemplates,
  parseResumeText,
} from "@/lib/api/templates";
import { createResume, updateResume } from "@/lib/api/resume";
import type { TemplateItem, ParsedSection } from "@/lib/api/templates";
import type { TextBlock } from "@/components/preview/ClickablePdfView";
import type { ImageBlock } from "@/lib/pdf/image-extractor";
import type { ResumeData } from "@/lib/validators/resume.schema";
import {
  detectModules,
  getModuleByBlockIndex,
  getModuleBlockIndices,
} from "@/lib/pdf/module-detector";
import { buildModuleHtml, parseModuleHtml } from "@/lib/editor/html-parser";
import type { BlockTextData } from "@/lib/editor/html-parser";
import { extractTextBlocks, blocksToAiText } from "@/lib/pdf/text-extractor";
import { extractImages } from "@/lib/pdf/image-extractor";
import { renderAllPages, downloadPdf } from "@/lib/pdf/page-renderer";
import { useEditorStore } from "@/stores/editor-store";
import { SAMPLE_RESUME_DATA } from "./sample-data";

const ClickablePdfView = dynamic(
  () =>
    import("@/components/preview/ClickablePdfView").then(
      (m) => m.ClickablePdfView,
    ),
  { ssr: false },
);

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
      case "textarea":
        summary = summary || sec.content || "";
        break;
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

export function ResumeNewContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template") ?? undefined;

  // ── Store ──
  const resumeData = useEditorStore((s) => s.resumeData);
  const parsing = useEditorStore((s) => s.parsing);
  const modules = useEditorStore((s) => s.modules);
  const activeModuleId = useEditorStore((s) => s.activeModuleId);
  const editedModules = useEditorStore((s) => s.editedModules);
  const deletedModules = useEditorStore((s) => s.deletedModules);
  const templateImages = useEditorStore((s) => s.templateImages);
  const editedImages = useEditorStore((s) => s.editedImages);
  const deletedImages = useEditorStore((s) => s.deletedImages);
  const resumeId = useEditorStore((s) => s.resumeId);
  const saving = useEditorStore((s) => s.saving);
  const saved = useEditorStore((s) => s.saved);
  const templateSnapshot = useEditorStore((s) => s.templateSnapshot);

  const setTemplate = useEditorStore((s) => s.setTemplate);
  const captureTemplate = useEditorStore((s) => s.captureTemplate);
  const setTemplateImages = useEditorStore((s) => s.setTemplateImages);
  const setResumeData = useEditorStore((s) => s.setResumeData);
  const setParsing = useEditorStore((s) => s.setParsing);
  const setModules = useEditorStore((s) => s.setModules);
  const setActiveModuleId = useEditorStore((s) => s.setActiveModuleId);
  const updateModuleText = useEditorStore((s) => s.updateModuleText);
  const toggleModuleDeleted = useEditorStore((s) => s.toggleModuleDeleted);
  const updateImage = useEditorStore((s) => s.updateImage);
  const replaceImageData = useEditorStore((s) => s.replaceImageData);
  const toggleImageDeleted = useEditorStore((s) => s.toggleImageDeleted);
  const setResumeId = useEditorStore((s) => s.setResumeId);
  const setSaving = useEditorStore((s) => s.setSaving);
  const setSaved = useEditorStore((s) => s.setSaved);

  const templateCaptured = useRef(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [imageWidthInput, setImageWidthInput] = useState("");
  const [imageHeightInput, setImageHeightInput] = useState("");
  const [keepRatio, setKeepRatio] = useState(true);

  const { data: uploadedTemplates = [] } = useRequest(getTemplates);

  const uploadedTemplate: TemplateItem | undefined = templateId
    ? uploadedTemplates.find((t) => t.id === templateId)
    : undefined;

  const pdfUrl = uploadedTemplate
    ? `/uploads/templates/${uploadedTemplate.id}.pdf`
    : undefined;

  const hasPdf = !!pdfUrl;

  const templateKey = `${templateId ?? ""}|${pdfUrl ?? ""}`;
  const [prevTemplateKey, setPrevTemplateKey] = useState(templateKey);
  if (templateKey !== prevTemplateKey) {
    setPrevTemplateKey(templateKey);
    setActiveImageId(null);
  }

  useEffect(() => {
    setTemplate(templateId, pdfUrl);
    templateCaptured.current = false;
  }, [templateId, pdfUrl, setTemplate]);

  const activeModule = useMemo(() => {
    if (!activeModuleId) return null;
    return modules.find((m) => m.id === activeModuleId) ?? null;
  }, [activeModuleId, modules]);

  const activeBlockIndices = useMemo(
    () => getModuleBlockIndices(activeModule),
    [activeModule],
  );

  const editedModuleIds = useMemo(() => {
    return new Set(Object.keys(editedModules));
  }, [editedModules]);

  const activeModuleHtml = useMemo(() => {
    if (!activeModule) return "";
    if (editedModules[activeModule.id] != null) return editedModules[activeModule.id];
    return buildModuleHtml(activeModule.blocks);
  }, [activeModule, editedModules]);

  const editedBlocks = useMemo(() => {
    const map = new Map<number, BlockTextData>();
    const snapModules = templateSnapshot?.modules;
    if (!snapModules) return map;
    for (const mod of snapModules) {
      if (deletedModules.has(mod.id)) continue;
      const html = editedModules[mod.id];
      if (!html) continue;
      const blockData = parseModuleHtml(html, mod.blocks.length);
      for (let i = 0; i < mod.blocks.length; i++) {
        const data = blockData[i];
        if (data) map.set(mod.blocks[i].globalIndex, data);
      }
    }
    return map;
  }, [editedModules, templateSnapshot, deletedModules]);

  const deletedBlockIndices = useMemo(() => {
    const set = new Set<number>();
    const snapModules = templateSnapshot?.modules;
    if (!snapModules) return set;
    for (const mod of snapModules) {
      if (deletedModules.has(mod.id)) {
        for (const block of mod.blocks) set.add(block.globalIndex);
      }
    }
    return set;
  }, [deletedModules, templateSnapshot]);

  const displayImages = useMemo(() => {
    const map = new Map<string, ImageBlock>();
    for (const img of templateImages) map.set(img.id, img);
    for (const [id, img] of Object.entries(editedImages)) map.set(id, img);
    return [...map.values()];
  }, [templateImages, editedImages]);

  const activeImage = useMemo(() => {
    if (!activeImageId) return null;
    return displayImages.find((img) => img.id === activeImageId) ?? null;
  }, [activeImageId, displayImages]);

  // ── 上传模版 → 提取文本 + 图片 ──
  useEffect(() => {
    if (!pdfUrl) {
      queueMicrotask(() => {
        setResumeData(SAMPLE_RESUME_DATA);
        setModules([]);
        setActiveModuleId(null);
        setTemplateImages([]);
      });
      return;
    }
    queueMicrotask(() => {
      setModules([]);
      setActiveModuleId(null);
      setTemplateImages([]);
    });

    let cancelled = false;
    const run = async () => {
      setParsing(true);
      try {
        const blocks = await extractTextBlocks(pdfUrl);
        if (cancelled || blocks.length === 0) return;
        const text = blocksToAiText(blocks);
        const [parsed, images] = await Promise.all([
          parseResumeText(text).catch(() => null),
          extractImages(pdfUrl).catch(() => [] as ImageBlock[]),
        ]);
        if (cancelled) return;
        setResumeData(parsed ? parsedSectionsToResumeData(parsed.sections) : SAMPLE_RESUME_DATA);
        setTemplateImages(images);
      } catch {
        if (!cancelled) setResumeData(SAMPLE_RESUME_DATA);
      } finally {
        if (!cancelled) setParsing(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [pdfUrl, setResumeData, setParsing, setModules, setActiveModuleId, setTemplateImages]);

  const handleBlocksExtracted = useCallback(
    (blocks: TextBlock[]) => {
      if (!templateCaptured.current && blocks.length > 0) {
        const mods = detectModules(blocks);
        captureTemplate(blocks, mods);
        templateCaptured.current = true;
      }
      setModules(detectModules(blocks));
    },
    [captureTemplate, setModules],
  );

  const handleBlockClick = useCallback(
    (block: TextBlock) => {
      setActiveImageId(null);
      const mod = getModuleByBlockIndex(modules, block.globalIndex);
      if (mod) setActiveModuleId(mod.id);
    },
    [modules, setActiveModuleId],
  );

  const handleImageClick = useCallback((image: ImageBlock) => {
    setActiveModuleId(null);
    setActiveImageId(image.id);
    setImageWidthInput(String(Math.round(image.width)));
    setImageHeightInput(String(Math.round(image.height)));
  }, [setActiveModuleId]);

  const handleModuleSelect = useCallback(
    (moduleId: string) => {
      setActiveImageId(null);
      setActiveModuleId(moduleId);
    },
    [setActiveModuleId],
  );

  const handleModuleTextChange = useCallback(
    (html: string) => {
      if (!activeModuleId) return;
      updateModuleText(activeModuleId, html);
    },
    [activeModuleId, updateModuleText],
  );

  // ── 删除/恢复当前模块 ──
  const handleDeleteModule = useCallback(() => {
    if (!activeModuleId) return;
    toggleModuleDeleted(activeModuleId);
    // 不清理 activeModuleId，保持选中状态让用户可以继续编辑
  }, [activeModuleId, toggleModuleDeleted]);

  // ── 拆分当前模块（每个 block 独立成模块）──
  const handleSplitModule = useCallback(() => {
    if (!activeModuleId) return;
    const mod = modules.find((m) => m.id === activeModuleId);
    if (!mod || mod.blocks.length <= 1) return;

    const snapBlocks = templateSnapshot?.blocks;
    if (!snapBlocks) return;

    // 把当前模块的 block 逐个拆成独立模块
    const newModules = modules.filter((m) => m.id !== activeModuleId);
    const page = mod.page;
    let idx = newModules.filter((m) => m.page === page).length;

    for (const block of mod.blocks) {
      const label = block.text.length > 20
        ? block.text.slice(0, 20) + "…"
        : block.text;
      newModules.push({
        id: `module-${page}-${idx}`,
        label: label || "模块",
        page,
        blocks: [block],
      });
      idx++;
    }

    // 排序
    newModules.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return (a.blocks[0]?.y ?? 0) - (b.blocks[0]?.y ?? 0);
    });

    setModules(newModules);

    // 选中第一个拆分出的新模块
    const firstNew = newModules.find(
      (m) => m.blocks[0]?.globalIndex === mod.blocks[0]?.globalIndex,
    );
    if (firstNew) setActiveModuleId(firstNew.id);

    toast.success("模块已拆分");
  }, [activeModuleId, modules, templateSnapshot, setModules, setActiveModuleId]);

  // ── 删除当前图片 ──
  const handleDeleteImage = useCallback(() => {
    if (!activeImageId) return;
    toggleImageDeleted(activeImageId);
    setActiveImageId(null);
  }, [activeImageId, toggleImageDeleted]);

  // ── 图片宽高 ──
  const handleImageWidthChange = useCallback(
    (val: string) => {
      setImageWidthInput(val);
      const w = parseFloat(val);
      if (isNaN(w) || !activeImage) return;
      if (keepRatio) {
        const ratio = activeImage.originalHeight / activeImage.originalWidth;
        const newH = Math.round(w * ratio);
        setImageHeightInput(String(newH));
        updateImage(activeImage.id, { width: w, height: newH });
      } else {
        updateImage(activeImage.id, { width: w });
      }
    },
    [activeImage, keepRatio, updateImage],
  );

  const handleImageHeightChange = useCallback(
    (val: string) => {
      setImageHeightInput(val);
      const h = parseFloat(val);
      if (isNaN(h) || !activeImage) return;
      if (keepRatio) {
        const ratio = activeImage.originalWidth / activeImage.originalHeight;
        const newW = Math.round(h * ratio);
        setImageWidthInput(String(newW));
        updateImage(activeImage.id, { width: newW, height: h });
      } else {
        updateImage(activeImage.id, { height: h });
      }
    },
    [activeImage, keepRatio, updateImage],
  );

  const handleReplaceImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !activeImage) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        replaceImageData(activeImage.id, dataUrl);
        const img = new Image();
        img.onload = () => {
          updateImage(activeImage.id, {
            originalWidth: img.naturalWidth,
            originalHeight: img.naturalHeight,
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [activeImage, replaceImageData, updateImage]);

  // ── 保存到云端 ──
  const handleSaveToDb = useCallback(async () => {
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast.success("已保存到云端");
    } catch (err) {
      console.error("保存失败:", err);
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [resumeId, resumeData, templateId, uploadedTemplate, setSaving, setSaved, setResumeId]);

  // ── 导出 PDF ──
  const handleExportPdf = useCallback(async () => {
    if (!uploadedTemplate || !pdfUrl) { toast.warning("请先选择模版"); return; }
    const snapModules = templateSnapshot?.modules;
    const snapBlocks = templateSnapshot?.blocks;
    if (!snapBlocks || snapBlocks.length === 0) {
      toast.warning("尚未提取文本块，请等待 PDF 加载完成");
      return;
    }
    setExporting(true);
    try {
      toast.info("正在生成 PDF...");
      const pageDataUrls = await renderAllPages(
        pdfUrl,
        snapBlocks,
        snapModules ?? [],
        editedModules,
        deletedModules,
        editedImages,
        deletedImages,
        (current, total) => console.log(`PDF 渲染进度: ${current}/${total}`),
      );
      if (pageDataUrls.length === 0) { toast.error("PDF 生成失败"); return; }
      const filename = `${uploadedTemplate.name ?? "resume"}.pdf`;
      await downloadPdf(pageDataUrls, filename);
      toast.success("PDF 已导出");
    } catch (err) {
      console.error("导出 PDF 失败:", err);
      toast.error("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  }, [uploadedTemplate, pdfUrl, templateSnapshot, editedModules, deletedModules, editedImages, deletedImages]);

  return (
    <div className="h-dvh flex flex-col bg-background">
      {/* Top bar */}
      <header className="shrink-0 flex items-center gap-3 border-b px-4 h-12">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/templates" className="flex items-center gap-1.5">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">返回</span>
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate flex items-center gap-1.5 flex-1">
          <FileText className="size-3.5" />
          {uploadedTemplate ? `简历编辑 — ${uploadedTemplate.name}` : "简历编辑"}
        </span>
        <Button size="sm" variant="outline" onClick={handleSaveToDb} disabled={saving || parsing} className="shrink-0 gap-1.5">
          {saving ? <><Loader2 className="size-3.5 animate-spin" />保存中...</> : saved ? <><Check className="size-3.5" />已保存</> : <><Save className="size-3.5" />保存到云端</>}
        </Button>
        <Button size="sm" onClick={handleExportPdf} disabled={exporting || parsing} className="shrink-0 gap-1.5">
          {exporting ? <><Loader2 className="size-3.5 animate-spin" />导出中...</> : <><Download className="size-3.5" />导出 PDF</>}
        </Button>
      </header>

      {/* 3-column body */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0">
        {/* Left: PDF preview */}
        <section className="col-span-1 md:col-span-6 overflow-auto bg-muted/30 flex flex-col">
          <div className="flex-1 py-4">
            {hasPdf ? (
              <ClickablePdfView
                url={pdfUrl!}
                activeBlockIndices={activeBlockIndices}
                editedBlocks={editedBlocks}
                deletedBlockIndices={deletedBlockIndices}
                images={displayImages}
                activeImageId={activeImageId}
                deletedImageIds={deletedImages}
                onBlockClick={handleBlockClick}
                onImageClick={handleImageClick}
                onBlocksExtracted={handleBlocksExtracted}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">请选择模版</div>
            )}
          </div>
        </section>

        {/* Middle: Editor panel */}
        <section className="hidden md:flex flex-col border-r bg-background min-h-0 md:col-span-4">
          {parsing ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-xs">AI 解析简历内容...</p>
            </div>
          ) : activeImage ? (
            /* Image editor */
            <div className="flex flex-col h-full">
              <div className="shrink-0 px-4 py-2 border-b flex items-center gap-2">
                <ImageIcon className="size-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">证件照</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">第 {activeImage.page} 页</span>
                <Button size="sm" variant="destructive" onClick={handleDeleteImage} className="ml-2 gap-1 h-7 text-xs">
                  <Trash2 className="size-3" />删除
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div className="border rounded-lg p-2 bg-muted/20">
                  <div className="relative h-32">
                    <NextImage src={activeImage.dataUrl} alt="预览" fill unoptimized className="object-contain rounded" />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleReplaceImage} className="w-full gap-1.5">
                  <Upload className="size-3.5" />替换图片
                </Button>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">宽</span>
                    <input type="number" value={imageWidthInput} onChange={(e) => handleImageWidthChange(e.target.value)} className="flex-1 h-7 text-xs border rounded px-2" />
                    <span className="text-[10px] text-muted-foreground">px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">高</span>
                    <input type="number" value={imageHeightInput} onChange={(e) => handleImageHeightChange(e.target.value)} className="flex-1 h-7 text-xs border rounded px-2" />
                    <span className="text-[10px] text-muted-foreground">px</span>
                  </div>
                  <button type="button" onClick={() => setKeepRatio(!keepRatio)} className={cn("flex items-center gap-1 text-[10px]", keepRatio ? "text-primary" : "text-muted-foreground")}>
                    {keepRatio ? <Lock className="size-3" /> : <Unlock className="size-3" />}保持比例
                  </button>
                </div>
              </div>
            </div>
          ) : activeModule ? (
            /* Module editor */
            <div className="flex flex-col h-full">
              <div className="shrink-0 px-4 py-2 border-b flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold truncate">
                  {deletedModules.has(activeModule.id) && <span className="text-destructive mr-1">[已删除]</span>}
                  {activeModule.label}
                </h3>
                <span className="text-[10px] text-muted-foreground ml-auto">{activeModule.blocks.length} 块</span>
                {activeModule.blocks.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={handleSplitModule} className="gap-1 h-7 text-xs" title="拆分此模块为独立行">
                    <Scissors className="size-3" />拆分
                  </Button>
                )}
                {deletedModules.has(activeModule.id) ? (
                  <Button size="sm" variant="outline" onClick={handleDeleteModule} className="ml-1 gap-1 h-7 text-xs text-green-600 border-green-300 hover:bg-green-50">
                    <Undo2 className="size-3" />恢复
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={handleDeleteModule} className="ml-1 gap-1 h-7 text-xs">
                    <Trash2 className="size-3" />删除
                  </Button>
                )}
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
              <p className="text-sm text-center">{hasPdf ? "点击 PDF 中的文字、图片或左侧模块开始编辑" : "请先选择模版"}</p>
            </div>
          )}
        </section>

        {/* Right: Module list */}
        <section className="hidden md:flex flex-col border-r bg-background min-h-0 md:col-span-2">
          <ModuleList
            modules={modules}
            activeModuleId={activeModuleId}
            editedModuleIds={editedModuleIds}
            deletedModules={deletedModules}
            onSelectModule={handleModuleSelect}
            onToggleDelete={toggleModuleDeleted}
          />
        </section>
      </div>
    </div>
  );
}
