CREATE TABLE IF NOT EXISTS `pending_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`section` text NOT NULL,
	`scope` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`original_value` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
