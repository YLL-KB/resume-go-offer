import { create } from "zustand";
import type { ImageBlock } from "@/lib/pdf/image-extractor";
import type { MdModule } from "@/lib/pdf/mineru-extractor";
import type { ResumeData } from "@/lib/validators/resume.schema";

const EMPTY_RESUME_DATA: ResumeData = {
  basic: { name: "", email: "", phone: "", location: "", website: "", title: "" },
  summary: "", education: [], experience: [], projects: [], skills: [],
};

interface EditorState {
  templateId: string | undefined;
  pdfUrl: string | undefined;

  // Markdown 提取
  markdown: string;
  markdownSource: "mineru" | "pdfjs" | null;
  parsing: boolean;

  // Markdown 模块（每个 ## 章节一个）
  mdModules: MdModule[];
  activeModuleId: string | null;
  editedModules: Record<string, string>; // moduleId → edited Markdown
  deletedModules: Set<string>;

  // 图片
  templateImages: ImageBlock[];
  editedImages: Record<string, ImageBlock>;
  deletedImages: Set<string>;

  // 持久化
  resumeData: ResumeData;
  resumeId: string | null;
  saving: boolean;
  saved: boolean;

  // Actions
  setTemplate: (id: string | undefined, url: string | undefined) => void;
  setMarkdown: (md: string, source: "mineru" | "pdfjs") => void;
  setMdModules: (modules: MdModule[]) => void;
  setParsing: (v: boolean) => void;
  setActiveModuleId: (id: string | null) => void;
  updateModuleText: (moduleId: string, text: string) => void;
  toggleModuleDeleted: (moduleId: string) => void;
  setTemplateImages: (images: ImageBlock[]) => void;
  updateImage: (id: string, changes: Partial<ImageBlock>) => void;
  replaceImageData: (id: string, dataUrl: string) => void;
  toggleImageDeleted: (id: string) => void;
  setResumeData: (data: ResumeData) => void;
  setResumeId: (id: string | null) => void;
  setSaving: (v: boolean) => void;
  setSaved: (v: boolean) => void;
  reset: () => void;
}

const init = {
  templateId: undefined as string | undefined,
  pdfUrl: undefined as string | undefined,
  markdown: "",
  markdownSource: null as "mineru" | "pdfjs" | null,
  parsing: false,
  mdModules: [] as MdModule[],
  activeModuleId: null as string | null,
  editedModules: {} as Record<string, string>,
  deletedModules: new Set<string>(),
  templateImages: [] as ImageBlock[],
  editedImages: {} as Record<string, ImageBlock>,
  deletedImages: new Set<string>(),
  resumeData: EMPTY_RESUME_DATA as ResumeData,
  resumeId: null as string | null,
  saving: false,
  saved: false,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...init,

  setTemplate: (id, url) => set({
    templateId: id, pdfUrl: url,
    markdown: "", markdownSource: null,
    mdModules: [], activeModuleId: null,
    editedModules: {}, deletedModules: new Set(),
    templateImages: [], editedImages: {}, deletedImages: new Set(),
    resumeData: EMPTY_RESUME_DATA,
  }),

  setMarkdown: (md, src) => set({ markdown: md, markdownSource: src }),

  setMdModules: (mods) => set({ mdModules: mods }),

  setParsing: (v) => set({ parsing: v }),

  setActiveModuleId: (id) => set({ activeModuleId: id }),

  updateModuleText: (moduleId, text) =>
    set((s) => ({ editedModules: { ...s.editedModules, [moduleId]: text } })),

  toggleModuleDeleted: (moduleId) =>
    set((s) => { const next = new Set(s.deletedModules); if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId); return { deletedModules: next }; }),

  setTemplateImages: (images) => set({ templateImages: images }),

  updateImage: (id, changes) => set((s) => {
    const existing = s.editedImages[id] ?? s.templateImages.find(img => img.id === id);
    if (!existing) return {};
    return { editedImages: { ...s.editedImages, [id]: { ...existing, ...changes } } };
  }),

  replaceImageData: (id, dataUrl) => set((s) => {
    const existing = s.editedImages[id] ?? s.templateImages.find(img => img.id === id);
    if (!existing) return {};
    return { editedImages: { ...s.editedImages, [id]: { ...existing, dataUrl } } };
  }),

  toggleImageDeleted: (id) =>
    set((s) => { const next = new Set(s.deletedImages); if (next.has(id)) next.delete(id); else next.add(id); return { deletedImages: next }; }),

  setResumeData: (data) => set({ resumeData: data }),
  setResumeId: (id) => set({ resumeId: id }),
  setSaving: (v) => set({ saving: v }),
  setSaved: (v) => set({ saved: v }),
  reset: () => set({ ...init }),
}));
