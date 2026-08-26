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
  `CREATE TABLE IF NOT EXISTS request_logs (id TEXT PRIMARY KEY NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, query_params TEXT DEFAULT '', request_body TEXT, response_body TEXT, user_id TEXT, ip TEXT NOT NULL, status_code INTEGER NOT NULL, duration_ms INTEGER NOT NULL, error_message TEXT, user_agent TEXT DEFAULT '', timestamp TEXT NOT NULL)`,
  `ALTER TABLE request_logs ADD COLUMN request_body TEXT`,
  `ALTER TABLE request_logs ADD COLUMN response_body TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(path)`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code)`,
  `CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id)`,
  `CREATE TABLE IF NOT EXISTS ai_traces (id TEXT PRIMARY KEY NOT NULL, request_log_id TEXT, conversation_id TEXT NOT NULL, user_id TEXT, mode TEXT, model TEXT, input TEXT NOT NULL, output TEXT, total_tokens INTEGER DEFAULT 0, duration_ms INTEGER NOT NULL, status TEXT NOT NULL, error_message TEXT, timestamp TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_spans (id TEXT PRIMARY KEY NOT NULL, trace_id TEXT NOT NULL, parent_span_id TEXT, type TEXT NOT NULL, name TEXT NOT NULL, node TEXT, model TEXT, input TEXT, output TEXT, tokens INTEGER DEFAULT 0, duration_ms INTEGER, status TEXT NOT NULL, error_message TEXT, timestamp TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_events (id TEXT PRIMARY KEY NOT NULL, trace_id TEXT NOT NULL, span_id TEXT, type TEXT NOT NULL, name TEXT NOT NULL, detail TEXT, timestamp TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_traces_timestamp ON ai_traces(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_traces_conversation_id ON ai_traces(conversation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_spans_trace_id ON ai_spans(trace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_trace_id ON ai_events(trace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_name ON ai_events(name)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_timestamp ON ai_events(timestamp)`,
  `CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, label TEXT NOT NULL, permissions TEXT DEFAULT '[]' NOT NULL, is_builtin INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS user_roles (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL, assigned_by TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, label TEXT NOT NULL, features TEXT DEFAULT '[]' NOT NULL, price_cents INTEGER, sort_order INTEGER DEFAULT 0 NOT NULL, is_active INTEGER DEFAULT 1 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS user_plans (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL, expires_at TEXT, assigned_by TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id)`,
  `CREATE TABLE IF NOT EXISTS token_usage (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, model TEXT NOT NULL, provider TEXT DEFAULT 'platform' NOT NULL, source TEXT NOT NULL, input_tokens INTEGER DEFAULT 0 NOT NULL, output_tokens INTEGER DEFAULT 0 NOT NULL, cost_cents INTEGER DEFAULT 0 NOT NULL, unit_price_input TEXT, unit_price_output TEXT, conversation_id TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_token_usage_user_time ON token_usage(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_token_usage_time ON token_usage(created_at)`,
  `CREATE TABLE IF NOT EXISTS user_ai_configs (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL UNIQUE, provider TEXT DEFAULT 'custom' NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL, api_key_enc TEXT NOT NULL, is_active INTEGER DEFAULT 1 NOT NULL, last_test_at TEXT, last_test_ok INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  // BYOK v2：按调用域分 scope（chat/extract/vision）。旧单配置表迁移到 scope=chat 后删除。
  `CREATE TABLE IF NOT EXISTS user_ai_scopes (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, scope TEXT NOT NULL, provider TEXT DEFAULT 'custom' NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL, api_key_enc TEXT NOT NULL, is_active INTEGER DEFAULT 1 NOT NULL, last_test_at TEXT, last_test_ok INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_scopes_user_scope ON user_ai_scopes(user_id, scope)`,
  `INSERT OR IGNORE INTO user_ai_scopes (id, user_id, scope, provider, base_url, model, api_key_enc, is_active, last_test_at, last_test_ok, created_at, updated_at) SELECT id, user_id, 'chat', provider, base_url, model, api_key_enc, is_active, last_test_at, last_test_ok, created_at, updated_at FROM user_ai_configs`,
  `DROP TABLE IF EXISTS user_ai_configs`,
  // BYOK v3：1..N 条自定义 API（scopes JSON 多选），旧按 scope 的表迁移为每条单 scope 后删除。
  `CREATE TABLE IF NOT EXISTS user_ai_apis (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, name TEXT DEFAULT '' NOT NULL, provider TEXT DEFAULT 'custom' NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL, api_key_enc TEXT NOT NULL, scopes TEXT DEFAULT '[]' NOT NULL, is_active INTEGER DEFAULT 1 NOT NULL, last_test_at TEXT, last_test_ok INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_user_ai_apis_user ON user_ai_apis(user_id)`,
  `INSERT OR IGNORE INTO user_ai_apis (id, user_id, name, provider, base_url, model, api_key_enc, scopes, is_active, last_test_at, last_test_ok, created_at, updated_at) SELECT id, user_id, scope, provider, base_url, model, api_key_enc, '["' || scope || '"]', is_active, last_test_at, last_test_ok, created_at, updated_at FROM user_ai_scopes`,
  `DROP TABLE IF EXISTS user_ai_scopes`,
  // 内置角色种子（INSERT OR IGNORE 幂等）
  `INSERT OR IGNORE INTO roles (id, name, label, permissions, is_builtin, created_at, updated_at) VALUES ('role-super-admin', 'super_admin', '超级管理员', '["*"]', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO roles (id, name, label, permissions, is_builtin, created_at, updated_at) VALUES ('role-admin', 'admin', '管理员', '["admin.users","admin.logs","admin.traces"]', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO roles (id, name, label, permissions, is_builtin, created_at, updated_at) VALUES ('role-viewer', 'viewer', '只读', '["admin.logs","admin.traces"]', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  // 内置套餐种子
  `INSERT OR IGNORE INTO plans (id, name, label, features, price_cents, sort_order, is_active, created_at, updated_at) VALUES ('plan-free', 'free', '免费版', '[]', NULL, 0, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  `ALTER TABLE applications ADD COLUMN jd TEXT`,
  `CREATE TABLE IF NOT EXISTS interview_sessions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, resume_id TEXT NOT NULL, application_id TEXT, jd TEXT, position TEXT, company TEXT, status TEXT DEFAULT 'in_progress' NOT NULL, score INTEGER, report TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS interview_messages (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, audio_base64 TEXT, non_verbal TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_interview_messages_session ON interview_messages(session_id)`,
  // 核心业务表索引（历史遗漏，全表扫描导致读接口卡顿）
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id, applied_at)`,
  `CREATE INDEX IF NOT EXISTS idx_applications_resume ON applications(resume_id)`,
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
