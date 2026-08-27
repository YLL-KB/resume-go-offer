"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card, CardContent, AppHeader } from "@resume/ui";
import { Mic, Loader2, Video, VideoOff, Flag, AudioLines } from "lucide-react";
import { toast } from "sonner";
import { createStreamPlayer, startRealtimeAudio, type StreamPlayer, type RealtimeAudioCapture } from "@/lib/utils/audio";

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
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveInterviewer, setLiveInterviewer] = useState("");
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [generating, setGenerating] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCaptureRef = useRef<RealtimeAudioCapture | null>(null);
  const streamPlayerRef = useRef<StreamPlayer | null>(null);
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

  // 结束实时面试（关闭 WS + 停止采集/播放）
  const endRealtime = useCallback(() => {
    audioCaptureRef.current?.stop();
    audioCaptureRef.current = null;
    streamPlayerRef.current?.close();
    streamPlayerRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setListening(false);
    setLiveInterviewer("");
  }, []);

  // 开始全双工面试
  const startRealtime = useCallback(async () => {
    if (connecting || connected) return;
    setConnecting(true);
    // 在用户手势内创建播放器 + 采集器（内部都会创建并 resume AudioContext），
    // 若延迟到 ws.onopen 等异步回调里创建，autoplay 策略会挂起 context 导致无声/采集不到麦克风。
    const player = createStreamPlayer(24000);
    streamPlayerRef.current = player;
    const capture = startRealtimeAudio((wavBase64) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // client_timestamp 是智谱 VAD 判定静音间隔的必要字段，缺失会导致 speech_stopped 永不触发
        wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.append", audio: wavBase64, client_timestamp: Date.now() }));
      }
    });
    audioCaptureRef.current = capture;

    // 用户手势内启动麦克风采集（getUserMedia 触发权限框）：
    // 若延迟到 ws.onopen 等异步回调里调用，浏览器会因失去用户手势上下文而拒绝授权。
    try {
      await capture.start();
    } catch (err) {
      capture.stop();
      audioCaptureRef.current = null;
      setConnecting(false);
      const name = (err as { name?: string })?.name ?? "未知错误";
      toast.error(`无法访问麦克风（${name}），请检查浏览器地址栏的麦克风权限`);
      return;
    }

    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/api/interview/${id}/realtime`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
      };

      ws.onmessage = (evt) => {
        let event: { type?: string; [key: string]: unknown };
        try {
          event = JSON.parse(evt.data);
        } catch {
          return;
        }

        switch (event.type) {
          case "response.audio.delta":
            if (typeof event.delta === "string") player.feed(event.delta);
            break;
          case "response.audio_transcript.delta":
          case "response.text.delta":
            if (typeof event.delta === "string") setLiveInterviewer((p) => p + event.delta);
            break;
          case "response.audio_transcript.done": {
            const text = typeof event.transcript === "string" ? event.transcript.trim() : "";
            if (text) {
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), sessionId: id, role: "interviewer", content: text, audioBase64: null, nonVerbal: null, createdAt: new Date().toISOString() },
              ]);
            }
            setLiveInterviewer("");
            break;
          }
          case "conversation.item.input_audio_transcription.completed": {
            const text = typeof event.transcript === "string" ? event.transcript.trim() : "";
            if (text) {
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), sessionId: id, role: "candidate", content: text, audioBase64: null, nonVerbal: null, createdAt: new Date().toISOString() },
              ]);
            }
            break;
          }
          case "input_audio_buffer.speech_started":
            setListening(true);
            break;
          case "input_audio_buffer.speech_stopped":
            setListening(false);
            break;
          case "error":
            toast.error((event.message as string) ?? "实时连接出错");
            break;
        }
      };

      ws.onerror = () => {
        setConnecting(false);
        setConnected(false);
        toast.error("实时连接失败，请重试");
      };

      ws.onclose = () => {
        setConnected(false);
        setListening(false);
        setLiveInterviewer("");
      };
    } catch (err) {
      capture.stop();
      audioCaptureRef.current = null;
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "启动失败");
    }
  }, [connecting, connected, id]);

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
      endRealtime();
      cleanupCamera();
    };
  }, [fetchSession, startCamera, cleanupCamera, endRealtime]);

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
  }, [messages, liveInterviewer]);

  const handleEnd = async () => {
    if (generating) return;
    setGenerating(true);
    endRealtime();
    cleanupCamera();
    // 等最后一句转写落库（后端落库为同步，给延迟缓冲）
    await new Promise((r) => setTimeout(r, 500));
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
            <Button variant="outline" size="sm" onClick={handleEnd} disabled={generating || (!connected && messages.length === 0)}>
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
                          </div>
                        </div>
                      ))}
                    {liveInterviewer && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-800">
                          <span className="whitespace-pre-wrap">{liveInterviewer}</span>
                          <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-slate-400 align-middle" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </CardContent>

                {/* 控制区 */}
                <div className="border-t border-slate-100 p-4">
                  <div className="flex items-center justify-center">
                    {connected ? (
                      <div className="flex flex-col items-center gap-1">
                        <Button size="lg" onClick={handleEnd} disabled={generating} className="rounded-full bg-red-500 hover:bg-red-600">
                          <Flag className="size-4 mr-2" /> 结束面试
                        </Button>
                        <span className="text-xs text-slate-400">
                          {listening ? "正在听你说话..." : "面试进行中，随时开口回答或打断"}
                        </span>
                      </div>
                    ) : (
                      <Button
                        size="lg"
                        onClick={startRealtime}
                        disabled={connecting}
                        className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                      >
                        {connecting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Mic className="size-4 mr-2" />}
                        {connecting ? "连接中..." : "开始面试"}
                      </Button>
                    )}
                  </div>
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
