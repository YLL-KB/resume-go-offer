import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

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
 * 获取 SQLite 数据库实例（Drizzle ORM 包装）。
 * VPS 兜底用 better-sqlite3；数据库目录通过 DATABASE_DIR 环境变量指定，
 * 默认当前工作目录下的 .db（部署时指向持久化目录）。
 */
export function getDb(): ReturnType<typeof drizzleSqlite> {
  if (localDb) return localDb;

  const dbDir = process.env.DATABASE_DIR
    ? path.resolve(process.env.DATABASE_DIR)
    : path.resolve(process.cwd(), ".db");
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
