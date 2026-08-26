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
	jd: text("jd"),
});

// ============================================================
// RequestLog — API 请求日志
// ============================================================
export const requestLogs = sqliteTable("request_logs", {
	id: text("id").primaryKey(),
	method: text("method").notNull(),
	path: text("path").notNull(),
	queryParams: text("query_params").default(""),
	requestBody: text("request_body"),
	responseBody: text("response_body"),
	userId: text("user_id"),
	ip: text("ip").notNull(),
	statusCode: integer("status_code").notNull(),
	durationMs: integer("duration_ms").notNull(),
	errorMessage: text("error_message"),
	userAgent: text("user_agent").default(""),
	timestamp: text("timestamp").notNull(),
});

// ============================================================
// AITrace — 一次 AI 对话请求的可回放快照（生产主账本）
// ============================================================
export const aiTraces = sqliteTable("ai_traces", {
	id: text("id").primaryKey(),
	requestLogId: text("request_log_id"),
	conversationId: text("conversation_id").notNull(),
	userId: text("user_id"),
	mode: text("mode"),
	model: text("model"),
	input: text("input").notNull(),
	output: text("output"),
	totalTokens: integer("total_tokens").default(0),
	durationMs: integer("duration_ms").notNull(),
	status: text("status").notNull(),
	errorMessage: text("error_message"),
	timestamp: text("timestamp").notNull(),
});

// ============================================================
// AISpan — trace 内的节点/模型/工具调用
// ============================================================
export const aiSpans = sqliteTable("ai_spans", {
	id: text("id").primaryKey(),
	traceId: text("trace_id").notNull(),
	parentSpanId: text("parent_span_id"),
	type: text("type").notNull(),
	name: text("name").notNull(),
	node: text("node"),
	model: text("model"),
	input: text("input"),
	output: text("output"),
	tokens: integer("tokens").default(0),
	durationMs: integer("duration_ms"),
	status: text("status").notNull(),
	errorMessage: text("error_message"),
	timestamp: text("timestamp").notNull(),
});

// ============================================================
// AIEvent — 降级/错误/信息事件（degraded 监控的载体）
// ============================================================
export const aiEvents = sqliteTable("ai_events", {
	id: text("id").primaryKey(),
	traceId: text("trace_id").notNull(),
	spanId: text("span_id"),
	type: text("type").notNull(),
	name: text("name").notNull(),
	detail: text("detail"),
	timestamp: text("timestamp").notNull(),
});

// ============================================================
// Role — 后台角色（RBAC，permissions 为 JSON 数组字符串）
// ============================================================
export const roles = sqliteTable("roles", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	label: text("label").notNull(),
	permissions: text("permissions").notNull().default("[]"),
	isBuiltin: integer("is_builtin").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// ============================================================
// UserRole — 用户↔角色（一个用户可多角色）
// ============================================================
export const userRoles = sqliteTable("user_roles", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	roleId: text("role_id").notNull(),
	assignedBy: text("assigned_by"),
	createdAt: text("created_at").notNull(),
});

// ============================================================
// Plan — 套餐（收费地基，features 为 JSON 数组字符串，本期无支付）
// ============================================================
export const plans = sqliteTable("plans", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	label: text("label").notNull(),
	features: text("features").notNull().default("[]"),
	priceCents: integer("price_cents"),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: integer("is_active").notNull().default(1),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// ============================================================
// UserPlan — 用户↔套餐（每用户一行，重赋则替换；expiresAt null = 永久）
// ============================================================
export const userPlans = sqliteTable("user_plans", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().unique(),
	planId: text("plan_id").notNull(),
	expiresAt: text("expires_at"),
	assignedBy: text("assigned_by"),
	createdAt: text("created_at").notNull(),
});

// ============================================================
// TokenUsage — AI 用量账本（计费地基）
// 只记账不拦截；unit_price_* 为调用时的价格快照（元/1M tokens），
// 改价不影响历史账。provider: platform | byok。
// ============================================================
export const tokenUsage = sqliteTable("token_usage", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	model: text("model").notNull(),
	provider: text("provider").notNull().default("platform"), // platform | byok
	source: text("source").notNull(), // chat | router | extract | improve | analyze | attachment | embedding | title | ...
	inputTokens: integer("input_tokens").notNull().default(0),
	outputTokens: integer("output_tokens").notNull().default(0),
	costCents: integer("cost_cents").notNull().default(0),
	// 价格快照（元/1M tokens），存字符串数字避免 float 精度问题
	unitPriceInput: text("unit_price_input"),
	unitPriceOutput: text("unit_price_output"),
	conversationId: text("conversation_id"),
	createdAt: text("created_at").notNull(),
});

// ============================================================
// UserAiApi — 用户自带 API（BYOK），1..N 条自定义 API 账号
// scopes 为 JSON 数组（如 ["chat","extract"]）：该 API 用于哪些环节。
// 环节取值：chat（主对话/标题/润色分析）/ extract（提取/附件文字解析）/ vision（图片识别）。
// 同一环节配置多条时，最早创建的生效。apiKeyEnc 为 AES-256-GCM 密文（密钥只进不出）。
// ============================================================
export const userAiApis = sqliteTable("user_ai_apis", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	name: text("name").notNull().default(""),
	provider: text("provider").notNull().default("custom"),
	baseUrl: text("base_url").notNull(),
	model: text("model").notNull(),
	apiKeyEnc: text("api_key_enc").notNull(),
	scopes: text("scopes").notNull().default("[]"),
	isActive: integer("is_active").notNull().default(1),
	lastTestAt: text("last_test_at"),
	lastTestOk: integer("last_test_ok"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// ============================================================
// InterviewSession — 视频模拟面试会话
// jd 为 ParsedJob JSON 字符串（投递带入或临时粘贴）；report 为评估报告 JSON 字符串
// ============================================================
export const interviewSessions = sqliteTable("interview_sessions", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	resumeId: text("resume_id").notNull(),
	applicationId: text("application_id"),
	jd: text("jd"),
	position: text("position"),
	company: text("company"),
	status: text("status").notNull().default("in_progress"), // in_progress | completed
	score: integer("score"),
	report: text("report"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

// ============================================================
// InterviewMessage — 面试消息（一问一答，含语音 + 非语言分析）
// audioBase64 为面试官 TTS 音频；nonVerbal 为该回答的视频帧分析结果 JSON
// ============================================================
export const interviewMessages = sqliteTable("interview_messages", {
	id: text("id").primaryKey(),
	sessionId: text("session_id").notNull(),
	role: text("role").notNull(), // interviewer | candidate | system
	content: text("content").notNull(),
	audioBase64: text("audio_base64"),
	nonVerbal: text("non_verbal"),
	createdAt: text("created_at").notNull(),
});
