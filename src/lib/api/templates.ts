export interface TemplateItem {
  id: string;
  name: string;
  desc: string;
  builtIn: boolean;
  url?: string;
  uploadedAt?: string;
  popular?: boolean;
}

export async function getTemplates(): Promise<TemplateItem[]> {
  const res = await fetch("/api/templates");
  return res.json();
}

export async function getTemplateSummary(
  id: string,
): Promise<{ title?: string; summary?: string }> {
  const res = await fetch(`/api/templates/${id}/summary`, { method: "POST" });
  return res.json();
}

export async function uploadTemplateFile(
  file: File,
): Promise<{ name: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/templates/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "上传失败");
  }

  return res.json() as Promise<{ name: string }>;
}

export interface TemplateSection {
  id: string;
  label: string;
  order: number;
  type: string;
  description?: string;
}

export interface TemplateAnalysis {
  layout: string;
  sections: TemplateSection[];
  style_hints: Record<string, unknown>;
  warning?: string;
}

export interface ParsedSection {
  title: string;
  type: "fields" | "textarea" | "list";
  fields?: { key: string; label: string; value: string }[];
  content?: string;
  items?: { fields: { key: string; label: string; value: string }[] }[];
}

export async function parseResumeText(content: string): Promise<{
  sections: ParsedSection[];
}> {
  const res = await fetch("/api/ai/parse-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "解析失败");
  }
  return res.json();
}

export async function analyzeTemplate(
  id: string,
): Promise<TemplateAnalysis> {
  const res = await fetch(`/api/templates/${id}/analyze`, { method: "POST" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "分析失败");
  }
  return res.json();
}

export async function deleteTemplateById(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "删除失败");
  }
}

export async function fillTemplatePdf(
  id: string,
  data: Record<string, unknown>,
): Promise<{ url: string }> {
  const res = await fetch(`/api/templates/${id}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "填充失败");
  }
  return res.json();
}
