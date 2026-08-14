/**
 * Sentry instrumentation — 注册全局异常捕获。
 *
 * 注意：本项目使用 @opennextjs/cloudflare 部署，
 * 为避免与 OpenNext 构建流程冲突，不使用 withSentryConfig。
 * 此处仅做客户端初始化 + 服务端 import。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.edge.config");
  }
}
