/**
 * 轻量级向量存储
 *
 * 纯内存实现，不需要外部数据库。支持：
 * - 批量添加向量 + 元数据
 * - 余弦相似度检索（top-k）
 *
 * 用于 RAG 知识库检索等场景。
 */

export interface VectorMetadata {
  category: string;
  content: string;
  [key: string]: unknown;
}

interface VectorEntry {
  vector: number[];
  metadata: VectorMetadata;
}

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class VectorStore {
  private entries: VectorEntry[] = [];

  /** 添加向量和元数据 */
  add(vectors: number[][], metadatas: VectorMetadata[]): void {
    for (let i = 0; i < vectors.length; i++) {
      this.entries.push({ vector: vectors[i], metadata: metadatas[i] });
    }
  }

  /** 余弦相似度搜索，返回 top-k 结果 */
  search(
    query: number[],
    k: number,
  ): Array<{ metadata: VectorMetadata; score: number }> {
    const scored = this.entries.map((entry) => ({
      metadata: entry.metadata,
      score: cosineSimilarity(query, entry.vector),
    }));

    // 按相似度降序排列
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, k);
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

/** 全局单例 */
export const vectorStore = new VectorStore();
