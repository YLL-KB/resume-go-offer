/**
 * 浏览器音频工具 — 录音（WebAudio 采 PCM → 编码 WAV → base64）+ 音频播放。
 *
 * 纯前端实现，无服务端转码依赖：
 *   - startRecording()：getUserMedia 采麦克风 → AudioContext 采 PCM → 停止时编码 WAV
 *   - playAudio(base64)：WAV base64 → Blob URL → Audio 播放
 *
 * 面试问答用：用户录音 → 后端智谱 GLM-ASR 转文字；面试官 TTS 音频 → 前端播放。
 */

export interface AudioRecording {
  /** 停止录音并返回 WAV 的 base64（不含 data: 前缀） */
  stop: () => Promise<string>;
  /** 取消录音，不返回数据 */
  cancel: () => void;
}

/** 采集到的原始 PCM 浮点样本（单声道） */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 块大小
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // 字节率
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 位深
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 开始录音，返回控制句柄（stop 返回 WAV base64） */
export async function startRecording(): Promise<AudioRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  let finished = false;

  const cleanup = () => {
    try {
      source.disconnect();
      processor.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void audioContext.close();
    } catch {
      // 清理失败不影响返回
    }
  };

  const merge = (): Float32Array => {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  };

  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        if (finished) return reject(new Error("录音已结束"));
        finished = true;
        try {
          cleanup();
          const wav = encodeWav(merge(), sampleRate);
          resolve(arrayBufferToBase64(wav));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("录音编码失败"));
        }
      }),
    cancel: () => {
      if (finished) return;
      finished = true;
      cleanup();
    },
  };
}

export interface StreamPlayer {
  /** 喂入一段 16bit 单声道 PCM（base64），按时间排队播放 */
  feed: (base64Chunk: string) => void;
  /** 等待已排队音频播放完毕 */
  finish: () => Promise<void>;
  /** 立即停止并释放资源 */
  close: () => void;
}

/**
 * 流式 PCM 播放器 — 把 TTS 流式返回的 base64 PCM 分片边收边播。
 *
 * 智谱 GLM-TTS 流式输出 16bit 单声道 PCM（24kHz），这里解码为 Int16(LE) → Float32，
 * 灌入 AudioBuffer 后按时间排队到 AudioBufferSourceNode，实现低延迟连续播放。
 *
 * 注意：AudioContext 在构造时立即创建并 resume，须在用户手势（如点击「停止并提交」）内调用，
 * 否则会被浏览器 autoplay 策略挂起，导致后续 feed 无声音。
 */
export function createStreamPlayer(sampleRate = 24000): StreamPlayer {
  const ctx = new AudioContext();
  void ctx.resume().catch(() => undefined);
  let nextTime = ctx.currentTime + 0.05;
  let tailEnd = 0;
  let closed = false;

  const ensure = (): AudioContext => {
    if (closed) throw new Error("播放器已关闭");
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  };

  return {
    feed: (base64Chunk: string) => {
      const context = ensure();
      const binary = atob(base64Chunk);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.length < 2) return;

      const int16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

      const buffer = context.createBuffer(1, float32.length, sampleRate);
      buffer.copyToChannel(float32, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);

      const startTime = Math.max(nextTime, context.currentTime + 0.02);
      source.start(startTime);
      nextTime = startTime + buffer.duration;
      tailEnd = Math.max(tailEnd, nextTime);
    },
    finish: () =>
      new Promise<void>((resolve) => {
        if (closed) return resolve();
        const remain = tailEnd - ctx.currentTime;
        if (remain <= 0) return resolve();
        setTimeout(resolve, remain * 1000 + 50);
      }),
    close: () => {
      closed = true;
      void ctx.close().catch(() => undefined);
    },
  };
}

/** 播放 WAV base64 音频，播放结束 resolve */
export function playAudio(base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("音频播放失败"));
    };
    audio.play().catch(reject);
  });
}
