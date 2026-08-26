/**
 * 智谱语音能力 — 语音识别（GLM-ASR）+ 语音合成（GLM-TTS）
 *
 * - speechToText：面试时把用户录音转成文字（ASR）
 * - textToSpeech：面试官文字 → 完整 wav（base64），供首问存库 / 历史回放
 * - textToSpeechChunks：面试官文字 → 流式 PCM 分片（base64），供实时低延迟播放
 *
 * 语音走智谱 open.bigmodel.cn（项目已用智谱 glm-4v / glm-4-flash）。
 * key 优先 ZHIPU_API_KEY，缺省回落 OPENAI_API_KEY（对齐 vision 的取值习惯）。
 * 语音按字节/字符量记账 source=interview，token 估算是近似值，成本计算在 pricing.ts 无对应单价时记 0。
 */

import { recordUsage } from "../billing/ledger";

const ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4";
const ASR_MODEL = "glm-asr-2512";
const TTS_MODEL = "glm-tts";
const TTS_VOICE = process.env.INTERVIEW_TTS_VOICE ?? "female";
/** 智谱流式 TTS 固定输出 16bit 单声道 PCM，24kHz */
const TTS_SAMPLE_RATE = 24000;

function zhipuApiKey(): string {
  return process.env.ZHIPU_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
}

/** 用户录音（base64 音频）→ 文字 */
export async function speechToText(audioBase64: string): Promise<string> {
  const apiKey = zhipuApiKey();
  if (!apiKey) throw new Error("未配置 ZHIPU_API_KEY，无法语音识别");

  const form = new FormData();
  form.append("model", ASR_MODEL);
  // ASR 只认 file 字段（文件上传），file_base64 字段实测返回 1214 参数为空
  form.append("file", new Blob([Buffer.from(audioBase64, "base64")], { type: "audio/wav" }), "audio.wav");
  form.append("stream", "false");

  const res = await fetch(`${ZHIPU_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`语音识别失败 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string; data?: { text?: string } };
  const text = data.text ?? data.data?.text ?? "";

  // base64 4 字符 ≈ 3 字节，作为 token 量级的近似（语音非 token 计费，仅记账用）
  recordUsage({
    model: ASR_MODEL,
    inputTokens: Math.max(1, Math.ceil(audioBase64.length / 4)),
    outputTokens: 0,
    source: "interview",
  });

  return text.trim();
}

/**
 * 面试官文字 → 流式 PCM 分片（base64）
 *
 * 智谱 stream=true 返回 SSE，每段 data.choices[0].delta.content 是一段 base64 PCM，
 * 结束标记为 data.choices[0].finish_reason === "stop"。逐个 yield base64 PCM。
 */
export async function* textToSpeechChunks(text: string): AsyncGenerator<string> {
  const apiKey = zhipuApiKey();
  if (!apiKey) throw new Error("未配置 ZHIPU_API_KEY，无法语音合成");

  const res = await fetch(`${ZHIPU_BASE}/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text,
      voice: TTS_VOICE,
      response_format: "pcm",
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`语音合成失败 (${res.status}): ${errText.slice(0, 200)}`);
  }

  recordUsage({
    model: TTS_MODEL,
    inputTokens: Math.max(1, Math.ceil(text.length / 2)),
    outputTokens: 0,
    source: "interview",
  });

  const reader = res.body?.getReader();
  if (!reader) throw new Error("语音合成流不可用");

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
      if (!payload || payload === "[DONE]") continue;

      let parsed: {
        choices?: Array<{ finish_reason?: string; delta?: { content?: string } }>;
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = parsed.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) continue; // 结束标记，无音频内容
      const content = choice.delta?.content;
      if (typeof content === "string" && content) yield content;
    }
  }
}

/** 把累积的 16bit 单声道 PCM 字节包装成 WAV（RIFF 44 字节头） */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt 块大小
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // 单声道
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // 字节率（16bit 单声道）
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // 位深
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** 累积的 PCM 分片（base64）→ 完整 WAV（base64），供存库 / 历史回放 */
export function pcmChunksToWavBase64(chunks: string[]): string {
  const pcm = Buffer.concat(chunks.map((c) => Buffer.from(c, "base64")));
  return pcmToWav(pcm, TTS_SAMPLE_RATE).toString("base64");
}

/** 面试官文字 → 完整 WAV（base64），供首问存库 / 历史回放 */
export async function textToSpeech(text: string): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of textToSpeechChunks(text)) chunks.push(chunk);
  return pcmChunksToWavBase64(chunks);
}
