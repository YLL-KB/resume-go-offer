CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resume_id` text NOT NULL,
	`company` text NOT NULL,
	`position` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`applied_at` text NOT NULL,
	`notes` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`template_id` text DEFAULT 'classic' NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
