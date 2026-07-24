CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`app_id` text NOT NULL,
	`country` text NOT NULL,
	`locale` text NOT NULL,
	`status` text NOT NULL,
	`step` text,
	`progress` text,
	`result` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
