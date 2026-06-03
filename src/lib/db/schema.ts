import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
