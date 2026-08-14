import { drizzle } from "drizzle-orm/d1";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

import type { DrizzleD1Database } from "drizzle-orm/d1";

let localDb: ReturnType<typeof drizzleSqlite> | null = null;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, authing_sub TEXT UNIQUE, github_id TEXT UNIQUE, github_login TEXT, name TEXT, email TEXT, avatar_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  // 为已有的 users 表补充 github 列（列不存在时执行）
  `ALTER TABLE users ADD COLUMN github_id TEXT`,
  `ALTER TABLE users ADD COLUMN github_login TEXT`,
  `CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, resume_id TEXT, title TEXT DEFAULT '新对话', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS resumes (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, title TEXT NOT NULL, template_id TEXT DEFAULT 'classic' NOT NULL, data TEXT NOT NULL, version INTEGER DEFAULT 1 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, resume_id TEXT NOT NULL, company TEXT NOT NULL, position TEXT NOT NULL, status TEXT DEFAULT 'applied' NOT NULL, applied_at TEXT NOT NULL, notes TEXT DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS request_logs (id TEXT PRIMARY KEY NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, query_params TEXT DEFAULT '', user_id TEXT, ip TEXT NOT NULL, status_code INTEGER NOT NULL, duration_ms INTEGER NOT NULL, error_message TEXT, user_agent TEXT DEFAULT '', timestamp TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(path)`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code)`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id)`,
];

/**
 * 获取 D1 数据库实例（Drizzle ORM 包装）。
 * Cloudflare 环境使用 D1，本地 dev 回退到 SQLite。
 */
let d1InitDone = false;

export function getDb(): DrizzleD1Database<typeof schema> | ReturnType<typeof drizzleSqlite> {
  try {
    const { env } = getCloudflareContext();
    if (env?.DB) {
      // 首次初始化时跑一遍 migration（D1 在 dev 模式可能绑定的是本地 SQLite）
      if (!d1InitDone) {
        d1InitDone = true;
        for (const sql of MIGRATIONS) {
          (env.DB as unknown as { exec(sql: string): Promise<unknown> }).exec(sql).catch(() => {});
        }
      }
      return drizzle(env.DB, { schema });
    }
  } catch {
    // Cloudflare context 不可用 → 回退本地 SQLite
  }

  if (localDb) return localDb;

  // ── 本地开发：SQLite fallback + 自动建表 ──
  const dbDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), ".db");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, "local.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  for (const sql of MIGRATIONS) {
    try {
      sqlite.exec(sql);
    } catch {
      // ALTER TABLE 可能因为列已存在而失败，忽略
    }
  }

  localDb = drizzleSqlite(sqlite, { schema });
  return localDb;
}

export type DbClient = ReturnType<typeof getDb>;
