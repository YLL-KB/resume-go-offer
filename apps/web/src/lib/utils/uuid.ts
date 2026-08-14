/**
 * 安全的 UUID 生成器
 *
 * 优先使用 crypto.randomUUID()（HTTPS），
 * 在 HTTP 非安全环境下回退到 Math.random 实现。
 */

export function randomUUID(): string {
  // 优先使用原生 API（需要安全上下文 HTTPS）
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // secure context 检查失败，走 fallback
    }
  }

  // Fallback: RFC 4122 v4 UUID（兼容 HTTP）
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
