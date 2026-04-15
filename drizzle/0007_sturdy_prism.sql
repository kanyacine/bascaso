CREATE TABLE `app_markers` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`date` text NOT NULL,
	`label` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL
);
