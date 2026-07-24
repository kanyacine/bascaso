CREATE TABLE `managed_account` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`encrypted_session` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`encrypted_dek` text NOT NULL,
	`updated_at` text NOT NULL
);
