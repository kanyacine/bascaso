CREATE TABLE `screenshot_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`languages` text NOT NULL,
	`output_device` text NOT NULL,
	`doc` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `screenshot_docs_current_unique` ON `screenshot_docs` (`app_id`) WHERE kind = 'current';