/**
 * 数组合并工具 — 保留已有数据中的关键字段（如日期），AI 补充其他字段
 */

export type AnyRecord = Record<string, unknown>;

/**
 * 合并两个数组：匹配已有项，保留指定字段的已有值，AI 只在字段为空时补充。
 * 匹配优先按 matchKey + title 精确匹配（支持同一公司多条经历），
 * 其次按 matchKey 匹配未使用的项。
 */
export function mergeArrayItems(
  aiItems: AnyRecord[],
  existingItems: AnyRecord[],
  matchKey: string,
  preserveKeys: string[],
): AnyRecord[] {
  if (existingItems.length === 0) return aiItems;
  if (aiItems.length === 0) return existingItems;

  const used = new Set<number>();

  const merged = aiItems.map((aiItem) => {
    const aiMatchValue = aiItem[matchKey];
    if (!aiMatchValue) return aiItem;

    // 优先：matchKey + title 精确匹配（同公司不同角色）
    const aiTitle = aiItem["title"];
    let matchIdx = -1;
    if (aiTitle) {
      matchIdx = existingItems.findIndex(
        (exItem, idx) =>
          !used.has(idx) &&
          exItem[matchKey] === aiMatchValue &&
          exItem["title"] === aiTitle,
      );
    }
    // 其次：仅 matchKey 匹配（跳过已使用的）
    if (matchIdx === -1) {
      matchIdx = existingItems.findIndex(
        (exItem, idx) =>
          !used.has(idx) &&
          exItem[matchKey] === aiMatchValue,
      );
    }
    if (matchIdx === -1) return aiItem;

    used.add(matchIdx);
    const exItem = existingItems[matchIdx];
    const result = { ...aiItem };
    for (const key of preserveKeys) {
      const exVal = exItem[key];
      if (typeof exVal === "string" && exVal.trim()) {
        result[key] = exVal;
      }
    }
    return result;
  });

  // 追加 AI 没匹配到的已有项
  for (let i = 0; i < existingItems.length; i++) {
    if (!used.has(i)) merged.push(existingItems[i]);
  }

  return merged;
}
