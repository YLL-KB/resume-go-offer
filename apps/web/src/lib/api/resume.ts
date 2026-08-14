import type { ResumeData } from "@/lib/validators/resume.schema";

export interface ResumeItem {
  id: string;
  title: string;
  templateId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeDetail extends ResumeItem {
  data: ResumeData;
}

export interface ResumeListResponse {
  resumes: ResumeItem[];
}

export async function listResumes(): Promise<ResumeItem[]> {
  const res = await fetch("/api/resume");
  return res.json();
}

export async function getResume(id: string): Promise<ResumeDetail> {
  const res = await fetch(`/api/resume/${id}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "获取失败");
  }
  return res.json();
}

export async function createResume(data: {
  title?: string;
  templateId?: string;
  data?: ResumeData;
}): Promise<{ id: string; title: string; templateId: string; data: ResumeData; version: number }> {
  const res = await fetch("/api/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "创建失败");
  }
  return res.json();
}

export async function updateResume(
  id: string,
  data: ResumeData,
): Promise<{ id: string; data: ResumeData; version: number }> {
  const res = await fetch(`/api/resume/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "保存失败");
  }
  return res.json();
}
