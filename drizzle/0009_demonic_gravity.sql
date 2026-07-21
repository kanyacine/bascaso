CREATE TABLE `keyword_scores` (
	`keyword` text NOT NULL,
	`country` text NOT NULL,
	`popularity` integer,
	`difficulty` integer NOT NULL,
	`opportunity` integer NOT NULL,
	`classification` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`keyword`, `country`)
);
