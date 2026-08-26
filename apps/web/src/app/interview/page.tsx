"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle, AppHeader, Label, Textarea, Input } from "@resume/ui";
import { Video, Loader2, ClipboardList, Upload, Link2, Image as ImageIcon, FileText, Check } from "lucide-react";
import { toast } from "sonner";
import { listResumes, type ResumeItem } from "@/lib/api/resume";

interface Application {
  id: string;
  company: string;
  position: string;
  jd?: string | null;
}

interface ParsedJob {
  company: string;
  position: string;
  location: string;
  salary: string;
  requirements: string[];
  responsibilities: string[];
  description: string;
}

type ResumeSource = "existing" | "upload";
type JdSource = "text" | "image" | "url";

export default function InterviewHomePage() {
  const router = useRouter();

  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 简历
  const [resumeSource, setResumeSource] = useState<ResumeSource>("existing");
  const [resumeId, setResumeId] = useState("");
  const [uploadedResume, setUploadedResume] = useState<{ resumeId: string; title: string } | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  // JD
  const [jdSource, setJdSource] = useState<JdSource>("text");
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [parsedJd, setParsedJd] = useState<ParsedJob | null>(null);
  const [parsingJd, setParsingJd] = useState(false);

  // 投递记录带入
  const [application, setApplication] = useState<Application | null>(null);

  const [starting, setStarting] = useState(false);

  const resumeFileRef = useRef<HTMLInputElement>(null);
  const jdImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listResumes()
      .then((list) => {
        setResumes(list);
        if (list.length > 0) setResumeId(list[0].id);
      })
      .catch(() => toast.error("加载简历列表失败"))
      .finally(() => setLoading(false));

    const applicationId = new URLSearchParams(window.location.search).get("applicationId");
    if (applicationId) {
      fetch("/api/applications")
        .then((res) => (res.ok ? (res.json() as Promise<Application[]>) : []))
        .then((apps) => {
          const app = apps.find((a) => a.id === applicationId);
          if (app) {
            setApplication(app);
            if (app.jd) {
              setJdText(app.jd);
              try {
                setParsedJd(JSON.parse(app.jd) as ParsedJob);
              } catch {
                /* jd 是纯文本 */
              }
            }
          }
        })
        .catch(() => {
          /* 忽略 */
        });
    }
  }, []);

  const handleResumeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/interview/parse-resume", { method: "POST", body: formData });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "简历解析失败");
      }
      const data = (await res.json()) as { resumeId: string; title: string };
      setUploadedResume(data);
      toast.success("简历解析成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "简历解析失败");
    } finally {
      setUploadingResume(false);
    }
  };

  const handleJdImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsingJd(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/interview/parse-jd", { method: "POST", body: formData });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "图片解析失败");
      }
      const data = (await res.json()) as { jd: ParsedJob };
      setParsedJd(data.jd);
      toast.success("岗位解析成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "图片解析失败");
    } finally {
      setParsingJd(false);
    }
  };

  const handleParseUrl = async () => {
    const url = jdUrl.trim();
    if (!url) {
      toast.error("请先输入招聘链接");
      return;
    }
    setParsingJd(true);
    try {
      const res = await fetch("/api/interview/parse-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "链接解析失败");
      }
      const data = (await res.json()) as { jd: ParsedJob };
      setParsedJd(data.jd);
      toast.success("岗位解析成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "链接解析失败");
    } finally {
      setParsingJd(false);
    }
  };

  const handleStart = async () => {
    const finalResumeId = resumeSource === "upload" ? uploadedResume?.resumeId : resumeId;
    if (!finalResumeId) {
      toast.error("请先选择或上传一份简历");
      return;
    }
    const jd = parsedJd ? JSON.stringify(parsedJd) : jdText.trim() || undefined;
    setStarting(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: finalResumeId,
          jd,
          applicationId: application?.id,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "发起面试失败");
      }
      const data = (await res.json()) as { sessionId: string };
      router.push(`/interview/${data.sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发起面试失败");
    } finally {
      setStarting(false);
    }
  };

  const segmentBtn = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
            <Video className="size-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">视频模拟面试</h1>
          <p className="mt-2 text-sm text-slate-500">
            基于你的简历和岗位要求，AI 面试官进行一对一视频面试，结束后生成评估报告
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>面试设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {application && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <ClipboardList className="size-4" />
                来自投递记录：{application.company} · {application.position}
              </div>
            )}

            {/* 简历 */}
            <div>
              <Label>选择简历 *</Label>
              <div className="mt-2 flex rounded-lg bg-slate-100 p-1">
                <button type="button" className={segmentBtn(resumeSource === "existing")} onClick={() => setResumeSource("existing")}>
                  已有简历
                </button>
                <button type="button" className={segmentBtn(resumeSource === "upload")} onClick={() => setResumeSource("upload")}>
                  上传文件
                </button>
              </div>

              <div className="mt-3">
                {resumeSource === "existing" ? (
                  loading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="size-4 animate-spin" /> 加载中...
                    </div>
                  ) : resumes.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      还没有简历，请切换到「上传文件」或先到「我的简历」创建一份
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {resumes.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setResumeId(r.id)}
                          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            resumeId === r.id
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <div className="truncate font-medium">{r.title}</div>
                          <div className="text-xs text-slate-400">版本 {r.version}</div>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div>
                    <input
                      ref={resumeFileRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={handleResumeFile}
                    />
                    {uploadedResume ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                        <Check className="size-4" />
                        <span className="truncate font-medium">{uploadedResume.title}</span>
                        <button
                          type="button"
                          className="ml-auto text-xs text-emerald-600 underline"
                          onClick={() => {
                            setUploadedResume(null);
                            resumeFileRef.current?.click();
                          }}
                        >
                          重新上传
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => resumeFileRef.current?.click()}
                        disabled={uploadingResume}
                        className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-600"
                      >
                        {uploadingResume ? (
                          <>
                            <Loader2 className="size-6 animate-spin" />
                            <span className="text-sm">解析简历中...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="size-6" />
                            <span className="text-sm">上传 PDF / Word 简历文件</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 岗位要求 */}
            <div>
              <Label>岗位要求（JD，可选）</Label>
              <div className="mt-2 flex rounded-lg bg-slate-100 p-1">
                <button type="button" className={segmentBtn(jdSource === "text")} onClick={() => setJdSource("text")}>
                  粘贴文本
                </button>
                <button type="button" className={segmentBtn(jdSource === "image")} onClick={() => setJdSource("image")}>
                  上传图片
                </button>
                <button type="button" className={segmentBtn(jdSource === "url")} onClick={() => setJdSource("url")}>
                  粘贴链接
                </button>
              </div>

              <div className="mt-3">
                {jdSource === "text" && (
                  <Textarea
                    value={jdText}
                    onChange={(e) => {
                      setJdText(e.target.value);
                      setParsedJd(null);
                    }}
                    placeholder="粘贴目标岗位的 JD（岗位职责、任职要求等），面试官会据此出题。也可以留空，面试官将基于简历和通用岗位要求提问。"
                    rows={5}
                  />
                )}

                {jdSource === "image" && (
                  <div>
                    <input ref={jdImageRef} type="file" accept="image/*" className="hidden" onChange={handleJdImage} />
                    <button
                      type="button"
                      onClick={() => jdImageRef.current?.click()}
                      disabled={parsingJd}
                      className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-600"
                    >
                      {parsingJd ? (
                        <>
                          <Loader2 className="size-6 animate-spin" />
                          <span className="text-sm">识别岗位信息中...</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="size-6" />
                          <span className="text-sm">上传招聘截图（PNG / JPG）</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {jdSource === "url" && (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={jdUrl}
                        onChange={(e) => {
                          setJdUrl(e.target.value);
                          setParsedJd(null);
                        }}
                        placeholder="粘贴招聘页面链接"
                        className="pl-9"
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={handleParseUrl} disabled={parsingJd || !jdUrl.trim()}>
                      {parsingJd ? <Loader2 className="size-4 animate-spin" /> : "解析"}
                    </Button>
                  </div>
                )}
              </div>

              {parsedJd && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <FileText className="size-4 text-emerald-500" />
                    {parsedJd.position || "岗位"}
                    {parsedJd.company ? <span className="text-slate-400">· {parsedJd.company}</span> : null}
                  </div>
                  {parsedJd.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{parsedJd.description}</p>
                  )}
                  {parsedJd.requirements?.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500">
                      要求 {parsedJd.requirements.length} 条 · 职责 {parsedJd.responsibilities?.length ?? 0} 条
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button onClick={handleStart} disabled={starting} className="w-full" size="lg">
              {starting ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> 正在准备面试官...
                </>
              ) : (
                <>
                  <Video className="size-4 mr-2" /> 开始面试
                </>
              )}
            </Button>
            <p className="text-center text-xs text-slate-400">
              开始前请确保已开启摄像头和麦克风权限
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
