import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ============================================================
// User — 用户
// ============================================================
export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	authingSub: text("authing_sub").unique(), // Authing 用户标识
	githubId: text("github_id").unique(), // GitHub 用户 ID（数字字符串）
	githubLogin: text("github_login"), // GitHub 用户名
	name: text("name"),
	email: text("email"),
	avatarUrl: text("avatar_url"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// ============================================================
// Conversation — 对话
// ============================================================
export const conversations = sqliteTable("conversations", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	resumeId: text("resume_id"), // 关联生成的简历
	title: text("title").default("新对话"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// ============================================================
// Message — 消息
// ============================================================
export const messages = sqliteTable("messages", {
	id: text("id").primaryKey(),
	conversationId: text("conversation_id").notNull(),
	role: text("role").notNull(), // "user" | "assistant" | "system"
	content: text("content").notNull(),
	createdAt: text("created_at").notNull(),
});

// ============================================================
// Resume — 简历主表
// ============================================================
export const resumes = sqliteTable("resumes", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	title: text("title").notNull(),
	templateId: text("template_id").notNull().default("classic"),
	data: text("data").notNull(), // JSON string of ResumeData
	version: integer("version").notNull().default(1),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// ============================================================
// Application — 投递记录
// ============================================================
export const applications = sqliteTable("applications", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	resumeId: text("resume_id").notNull(),
	company: text("company").notNull(),
	position: text("position").notNull(),
	status: text("status", {
		enum: ["applied", "screening", "interview", "offer", "rejected"],
	})
		.notNull()
		.default("applied"),
	appliedAt: text("applied_at").notNull(),
	notes: text("notes").default(""),
});

// ============================================================
// RequestLog — API 请求日志
// ============================================================
export const requestLogs = sqliteTable("request_logs", {
	id: text("id").primaryKey(),
	method: text("method").notNull(),
	path: text("path").notNull(),
	queryParams: text("query_params").default(""),
	userId: text("user_id"),
	ip: text("ip").notNull(),
	statusCode: integer("status_code").notNull(),
	durationMs: integer("duration_ms").notNull(),
	errorMessage: text("error_message"),
	userAgent: text("user_agent").default(""),
	timestamp: text("timestamp").notNull(),
});
