/**
 * Embedding 向量化工具
 *
 * 使用智谱 Embedding-3 模型将文本转换为向量表示。
 * API 与 OpenAI 兼容，直接复用现有的 openai 客户端。
 *
 * Embedding-3:
 *   - 默认 2048 维（支持 256/512/1024/2048）
 *   - 单条最多 3072 tokens
 *   - 单次请求最多 64 条
 */

import { openai } from "./index";
import { recordUsage } from "../billing/ledger";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "embedding-3";
const EMBEDDING_DIMENSIONS = 2048;
const BATCH_SIZE = 64; // 单次请求最多 64 条

/** 将单条文本转换为向量 */
export async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 3072), // embedding-3 单条上限 3072 tokens，粗略按字符截断
    dimensions: EMBEDDING_DIMENSIONS,
  });
  recordUsage({
    model: EMBEDDING_MODEL,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: 0,
    source: "embedding",
  });
  return res.data[0]?.embedding ?? [];
}

/** 批量将文本转换为向量，自动分批 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const allVectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.slice(0, 3072));
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    recordUsage({
      model: EMBEDDING_MODEL,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: 0,
      source: "embedding",
    });
    for (const item of res.data) {
      allVectors.push(item.embedding ?? []);
    }
  }

  return allVectors;
}
