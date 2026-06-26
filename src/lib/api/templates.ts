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

export async function deleteTemplateById(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "删除失败");
  }
}
