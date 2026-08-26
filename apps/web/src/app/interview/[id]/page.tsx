"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card, CardContent, AppHeader } from "@resume/ui";
import { Mic, Square, Loader2, Volume2, Video, VideoOff, Flag } from "lucide-react";
import { toast } from "sonner";
import { startRecording, playAudio, createStreamPlayer, type AudioRecording, type StreamPlayer } from "@/lib/utils/audio";

interface InterviewMessage {
  id: string;
  sessionId: string;
  role: "interviewer" | "candidate" | "system";
  content: string;
  audioBase64: string | null;
  nonVerbal: string | null;
  createdAt: string;
}

interface InterviewSession {
  id: string;
  resumeId: string;
  applicationId: string | null;
  jd: string | null;
  position: string | null;
  company: string | null;
  status: string;
  score: number | null;
  report: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReportDimension {
  name: string;
  score: number;
  comment: string;
}

interface ReportPerQuestion {
  question: string;
  answer: string;
  feedback: string;
  score: number;
}

interface InterviewReport {
  score: number;
  summary: string;
  dimensions: ReportDimension[];
  strengths: string[];
  improvements: string[];
  perQuestion: ReportPerQuestion[];
}

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [generating, setGenerating] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<AudioRecording | null>(null);
  const streamPlayerRef = useRef<StreamPlayer | null>(null);
  const autoPlayedRef = useRef(false);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/interview/${id}`);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "加载面试失败");
    }
    const data = (await res.json()) as {
      session: InterviewSession;
      messages: InterviewMessage[];
    };
    setSession(data.session);
    setMessages(data.messages);
  }, [id]);

  // 停止摄像头 + 帧采样
  const cleanupCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch {
      toast.error("无法访问摄像头，请在浏览器中授权摄像头权限（不影响语音面试）");
    }
  }, []);

  // 发送一帧视频画面做非语言分析
  const sendFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth || 320, 320);
      canvas.height = Math.round((canvas.width * (video.videoHeight || 240)) / (video.videoWidth || 320));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const base64 = dataUrl.replace(/^data:image\/[^;]+;base64,/, "");
      await fetch(`/api/interview/${id}/frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: base64, mimeType: "image/jpeg" }),
      });
    } catch {
      // 帧分析失败静默忽略，不打断面试
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
        void startCamera();
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "加载面试失败");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      cleanupCamera();
      recordingRef.current?.cancel();
      streamPlayerRef.current?.close();
    };
  }, [fetchSession, startCamera, cleanupCamera]);

  // 摄像头就绪后开始每 3s 采样一帧
  useEffect(() => {
    if (!cameraOn || report) return;
    frameTimerRef.current = setInterval(() => {
      void sendFrame();
    }, 3000);
    return () => {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    };
  }, [cameraOn, report, sendFrame]);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 进入详情页后自动播放首问语音（被浏览器 autoplay 拦截时静默降级为手动按钮）
  useEffect(() => {
    if (autoPlayedRef.current) return;
    const first = messages.find((m) => m.role === "interviewer" && m.audioBase64);
    if (!first?.audioBase64) return;
    autoPlayedRef.current = true;
    void playAudio(first.audioBase64).catch(() => undefined);
  }, [messages]);

  const handleStartRecord = async () => {
    try {
      recordingRef.current = await startRecording();
      setRecording(true);
    } catch {
      toast.error("无法访问麦克风，请授权麦克风权限");
    }
  };

  const handleStopRecord = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    setRecording(false);
    recordingRef.current = null;
    // 在用户手势内创建流式播放器，避免浏览器 autoplay 挂起 AudioContext
    streamPlayerRef.current?.close();
    const player = createStreamPlayer(24000);
    streamPlayerRef.current = player;
    try {
      const audioBase64 = await rec.stop();
      await submitAnswer(audioBase64, player);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "录音失败，请重试");
    }
  };

  const submitAnswer = async (audioBase64: string, player: StreamPlayer) => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/interview/${id}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64 }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "处理失败");
      }
      if (!res.body) throw new Error("流式响应不可用");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          let evt: { type?: string; content?: string; message?: string };
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.type === "text" && typeof evt.content === "string") {
            setMessages((prev) => [
              ...prev,
              {
                id: `tmp-${Date.now()}`,
                sessionId: id,
                role: "interviewer",
                content: evt.content as string,
                audioBase64: null,
                nonVerbal: null,
                createdAt: new Date().toISOString(),
              },
            ]);
          } else if (evt.type === "audio" && typeof evt.content === "string") {
            player.feed(evt.content);
          } else if (evt.type === "error") {
            toast.error(evt.message ?? "处理失败");
          }
        }
      }

      await fetchSession();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "处理失败");
    } finally {
      setProcessing(false);
    }
  };

  const handlePlay = async (msg: InterviewMessage) => {
    if (!msg.audioBase64) return;
    setPlayingId(msg.id);
    try {
      await playAudio(msg.audioBase64);
    } catch {
      toast.error("音频播放失败");
    } finally {
      setPlayingId(null);
    }
  };

  const handleEnd = async () => {
    if (generating) return;
    setGenerating(true);
    cleanupCamera();
    try {
      const res = await fetch(`/api/interview/${id}/complete`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "生成报告失败");
      }
      const data = (await res.json()) as InterviewReport;
      setReport(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成报告失败");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {session?.position || "模拟面试"}
              {session?.company ? <span className="text-slate-400"> · {session.company}</span> : null}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              {cameraOn ? <Video className="size-4 text-emerald-500" /> : <VideoOff className="size-4 text-slate-400" />}
              {cameraOn ? "摄像头已开启" : "摄像头未开启"}
            </span>
            <Button variant="outline" size="sm" onClick={handleEnd} disabled={generating}>
              <Flag className="size-3.5 mr-1" />
              {generating ? "生成中..." : "结束面试"}
            </Button>
          </div>
        </div>

        {report ? (
          <ReportCard report={report} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 摄像头 */}
            <div className="lg:col-span-1">
              <Card className="overflow-hidden">
                <div className="relative aspect-[3/4] bg-slate-900">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="size-full object-cover"
                  />
                  {!cameraOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <VideoOff className="size-8" />
                      <span className="text-sm">摄像头未开启</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* 对话区 */}
            <div className="lg:col-span-2">
              <Card className="flex h-[60vh] flex-col">
                <CardContent className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-3">
                    {messages
                      .filter((m) => m.role !== "system")
                      .map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === "candidate" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                              msg.role === "candidate"
                                ? "bg-emerald-500 text-white"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            {msg.role === "interviewer" && msg.audioBase64 && (
                              <button
                                type="button"
                                onClick={() => handlePlay(msg)}
                                className="mt-1.5 flex items-center gap-1 text-xs opacity-70 hover:opacity-100"
                              >
                                <Volume2 className="size-3.5" />
                                {playingId === msg.id ? "播放中..." : "播放语音"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    {processing && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="size-4 animate-spin" /> 正在识别回答并生成下一题...
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </CardContent>

                {/* 录音控制 */}
                <div className="border-t border-slate-100 p-4">
                  <div className="flex items-center justify-center">
                    {recording ? (
                      <Button size="lg" onClick={handleStopRecord} className="rounded-full bg-red-500 hover:bg-red-600">
                        <Square className="size-4 mr-2" /> 停止并提交
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={handleStartRecord}
                        disabled={processing}
                        className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                      >
                        <Mic className="size-4 mr-2" /> 按住回答
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-center text-xs text-slate-400">
                    {recording ? "正在录音，请回答面试官的问题" : "点击开始录音，回答完毕后点击停止"}
                  </p>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: InterviewReport }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 text-center">
          <div className="text-5xl font-bold text-emerald-600">{report.score}</div>
          <div className="mt-1 text-sm text-slate-400">综合评分</div>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-600">{report.summary}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {report.dimensions.map((d) => (
          <Card key={d.name}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-800">{d.score}</div>
              <div className="mt-1 text-sm font-medium text-slate-600">{d.name}</div>
              <p className="mt-1 text-xs text-slate-400">{d.comment}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-2 font-semibold text-slate-800">亮点</h3>
            <ul className="space-y-1.5 text-sm text-slate-600">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-emerald-500">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-2 font-semibold text-slate-800">改进建议</h3>
            <ul className="space-y-1.5 text-sm text-slate-600">
              {report.improvements.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-500">→</span>
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 font-semibold text-slate-800">逐题反馈</h3>
          <div className="space-y-4">
            {report.perQuestion.map((q, i) => (
              <div key={i} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium text-slate-800">Q{i + 1}. {q.question}</div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {q.score} 分
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">答：{q.answer}</p>
                <p className="mt-2 text-sm text-slate-600">反馈：{q.feedback}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
