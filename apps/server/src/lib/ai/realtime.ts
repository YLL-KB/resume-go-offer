/**
 * 智谱 GLM-Realtime 连接封装 — 全双工语音面试的核心通道。
 *
 * 后端作为中间人：
 *   - 用 `ws` 客户端连接智谱 wss://open.bigmodel.cn/api/paas/v4/realtime
 *   - 连接后立即下发 session.update（面试官 instructions + server_vad + audio 模式）
 *   - 把服务端事件回调给路由层（原样转发前端 + 抽取转写落库）
 *
 * 鉴权走服务端方式：Authorization: Bearer {id}.{secret}，key 不出后端。
 */

import WebSocket from "ws";
import { INTERVIEWER_REALTIME_PROMPT } from "./interview/prompts";

const REALTIME_URL = "wss://open.bigmodel.cn/api/paas/v4/realtime";

export interface RealtimeServerEvent {
  type?: string;
  [key: string]: unknown;
}

export interface RealtimeSessionOptions {
  instructions: string;
  /** 服务端事件（原样转发给前端） */
  onServerEvent: (event: RealtimeServerEvent) => void;
  /** 候选人转写完成（conversation.item.input_audio_transcription.completed） */
  onCandidateText: (text: string) => void;
  /** 面试官转写完成（response.audio_transcript.done） */
  onInterviewerText: (text: string) => void;
}

export interface RealtimeSession {
  send: (data: unknown) => void;
  close: () => void;
  isOpen: () => boolean;
}

/** 组装面试官 instructions（人设 + JD + 简历），供 session.update 注入 */
export function buildRealtimeInstructions(resumeData: unknown, jd: unknown): string {
  const resumeText = resumeData
    ? typeof resumeData === "string"
      ? resumeData
      : JSON.stringify(resumeData)
    : "（无简历数据）";
  const jdText = jd
    ? typeof jd === "string"
      ? jd
      : JSON.stringify(jd)
    : "（无岗位 JD，请基于简历与通用岗位要求出题）";

  return [
    INTERVIEWER_REALTIME_PROMPT,
    `【目标岗位 JD】\n${jdText.slice(0, 2000)}`,
    `【候选人简历】\n${resumeText.slice(0, 6000)}`,
  ].join("\n\n");
}

export function startRealtimeSession(opts: RealtimeSessionOptions): RealtimeSession {
  const apiKey = process.env.ZHIPU_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) throw new Error("未配置智谱 API Key，无法建立实时面试连接");

  const ws = new WebSocket(REALTIME_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  let open = false;

  ws.on("open", () => {
    open = true;
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          input_audio_format: "wav",
          output_audio_format: "pcm",
          modalities: ["audio", "text"],
          instructions: opts.instructions,
          turn_detection: { type: "server_vad" },
          beta_fields: { chat_mode: "audio", tts_source: "e2e", auto_search: true },
        },
      }),
    );
  });

  ws.on("message", (data) => {
    let event: RealtimeServerEvent;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const text = event.transcript;
      if (typeof text === "string" && text.trim()) opts.onCandidateText(text.trim());
    } else if (event.type === "response.audio_transcript.done") {
      const text = event.transcript;
      if (typeof text === "string" && text.trim()) opts.onInterviewerText(text.trim());
    }

    opts.onServerEvent(event);
  });

  ws.on("error", () => {
    opts.onServerEvent({ type: "error", message: "智谱实时连接错误" });
  });

  ws.on("close", () => {
    open = false;
    opts.onServerEvent({ type: "closed" });
  });

  return {
    send: (data) => {
      if (open) ws.send(JSON.stringify(data));
    },
    close: () => {
      try {
        ws.close();
      } catch {
        // 已关闭，忽略
      }
    },
    isOpen: () => open,
  };
}
