CREATE TABLE `keyword_score_history` (
	`keyword` text NOT NULL,
	`country` text NOT NULL,
	`popularity` integer,
	`difficulty` integer NOT NULL,
	`opportunity` integer NOT NULL,
	`result_ids` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`keyword`, `country`, `fetched_at`)
);
--> statement-breakpoint
ALTER TABLE `keyword_scores` ADD `competitors` text;