import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/**
 * 获取 D1 数据库实例（Drizzle ORM 包装）。
 * 优先使用 request-scoped context，否则回退到全局 env。
 */
export function getDb() {
	try {
		const { env } = getCloudflareContext();
		return drizzle(env.DB, { schema });
	} catch {
		// 非 Cloudflare 环境（如本地 dev）fallback
		throw new Error(
			"D1 binding not found. Ensure `DB` is bound in wrangler.jsonc.",
		);
	}
}

export type DbClient = ReturnType<typeof getDb>;
