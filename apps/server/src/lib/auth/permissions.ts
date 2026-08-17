/**
 * 权限点与功能项目录 — 权限系统的单一事实源。
 *
 * - ADMIN_PERMISSIONS：后台页面级权限点（RBAC），角色按需组合。
 * - FEATURE_FLAGS：面向用户的收费/套餐功能项（entitlement 地基）。
 *
 * 新增权限点/功能项时在此追加即可，后台权限页的 checkboxes 由 /api/admin/permissions/meta 驱动。
 */

export interface PermissionItem {
	key: string;
	label: string;
}

export const ADMIN_PERMISSIONS: PermissionItem[] = [
	{ key: "admin.users", label: "用户管理" },
	{ key: "admin.logs", label: "请求监控" },
	{ key: "admin.traces", label: "AI Traces" },
	{ key: "admin.permissions", label: "权限管理" },
];

export const FEATURE_FLAGS: PermissionItem[] = [
	{ key: "feature.unlimited_chat", label: "不限次数对话" },
	{ key: "feature.advanced_templates", label: "高级简历模板" },
	{ key: "feature.pdf_export", label: "PDF 导出" },
	{ key: "feature.resume_analysis", label: "简历深度分析" },
];

/** 通配权限，命中即拥有全部权限（超级管理员 bootstrap） */
export const WILDCARD = "*";
