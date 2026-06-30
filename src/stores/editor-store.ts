import { create } from "zustand";
import type { TextBlock } from "@/components/preview/ClickablePdfView";
import type { Module } from "@/lib/pdf/module-detector";
import type { ResumeData } from "@/lib/validators/resume.schema";
import type { ImageBlock } from "@/lib/pdf/image-extractor";
import { SAMPLE_RESUME_DATA } from "@/app/resume/new/sample-data";

interface TemplateSnapshot {
  blocks: TextBlock[];
  modules: Module[];
}

interface EditorState {
  // ── 模版 ──
  templateId: string | undefined;
  pdfUrl: string | undefined;
  templateSnapshot: TemplateSnapshot | null;

  // ── AI 解析 ──
  resumeData: ResumeData;
  parsing: boolean;

  // ── 模块编辑 ──
  modules: Module[];
  activeModuleId: string | null;
  editedModules: Record<string, string>;
  deletedModules: Set<string>;

  // ── 图片 ──
  templateImages: ImageBlock[];
  editedImages: Record<string, ImageBlock>;
  deletedImages: Set<string>;

  // ── 持久化 ──
  resumeId: string | null;
  saving: boolean;
  saved: boolean;

  // ── Actions ──
  setTemplate: (id: string | undefined, url: string | undefined) => void;
  captureTemplate: (blocks: TextBlock[], modules: Module[]) => void;
  setTemplateImages: (images: ImageBlock[]) => void;
  setResumeData: (data: ResumeData) => void;
  setParsing: (v: boolean) => void;
  setModules: (modules: Module[]) => void;
  setActiveModuleId: (id: string | null) => void;
  updateModuleText: (moduleId: string, html: string) => void;
  toggleModuleDeleted: (moduleId: string) => void;
  updateImage: (id: string, changes: Partial<ImageBlock>) => void;
  replaceImageData: (id: string, dataUrl: string) => void;
  toggleImageDeleted: (id: string) => void;
  setResumeId: (id: string | null) => void;
  setSaving: (v: boolean) => void;
  setSaved: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  templateId: undefined as string | undefined,
  pdfUrl: undefined as string | undefined,
  templateSnapshot: null as TemplateSnapshot | null,
  templateImages: [] as ImageBlock[],
  resumeData: SAMPLE_RESUME_DATA as ResumeData,
  parsing: false,
  modules: [] as Module[],
  activeModuleId: null as string | null,
  editedModules: {} as Record<string, string>,
  deletedModules: new Set<string>(),
  editedImages: {} as Record<string, ImageBlock>,
  deletedImages: new Set<string>(),
  resumeId: null as string | null,
  saving: false,
  saved: false,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initialState,

  setTemplate: (id, url) =>
    set({
      templateId: id,
      pdfUrl: url,
      templateSnapshot: null,
      templateImages: [],
      modules: [],
      activeModuleId: null,
      editedModules: {},
      deletedModules: new Set(),
      editedImages: {},
      deletedImages: new Set(),
      resumeData: SAMPLE_RESUME_DATA,
    }),

  captureTemplate: (blocks, modules) =>
    set({ templateSnapshot: { blocks, modules } }),

  setTemplateImages: (images) => set({ templateImages: images }),

  setResumeData: (data) => set({ resumeData: data }),

  setParsing: (v) => set({ parsing: v }),

  setModules: (modules) => set({ modules }),

  setActiveModuleId: (id) => set({ activeModuleId: id }),

  updateModuleText: (moduleId, html) =>
    set((s) => ({
      editedModules: { ...s.editedModules, [moduleId]: html },
    })),

  toggleModuleDeleted: (moduleId) =>
    set((s) => {
      const next = new Set(s.deletedModules);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return { deletedModules: next };
    }),

  updateImage: (id, changes) =>
    set((s) => {
      const existing =
        s.editedImages[id] ??
        s.templateImages.find((img) => img.id === id);
      if (!existing) return {};
      return {
        editedImages: {
          ...s.editedImages,
          [id]: { ...existing, ...changes },
        },
      };
    }),

  replaceImageData: (id, dataUrl) =>
    set((s) => {
      const existing =
        s.editedImages[id] ??
        s.templateImages.find((img) => img.id === id);
      if (!existing) return {};
      return {
        editedImages: {
          ...s.editedImages,
          [id]: { ...existing, dataUrl },
        },
      };
    }),

  toggleImageDeleted: (id) =>
    set((s) => {
      const next = new Set(s.deletedImages);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { deletedImages: next };
    }),

  setResumeId: (id) => set({ resumeId: id }),

  setSaving: (v) => set({ saving: v }),

  setSaved: (v) => set({ saved: v }),

  reset: () => set({ ...initialState }),
}));
