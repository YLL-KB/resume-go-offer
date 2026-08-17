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

/**
 * 聊天生成的简历同步到「我的简历」：
 * 对话已关联简历则更新（版本+1），否则新建并回填关联。
 * 前端在每次提取合并完成后静默调用（失败不打断对话）。
 */
export async function syncChatResume(
  conversationId: string,
  data: ResumeData,
): Promise<{ ok: boolean; resumeId: string; version: number; created: boolean }> {
  const res = await fetch("/api/chat/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, data }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error((err.error as string) ?? "同步失败");
  }
  return res.json();
}
