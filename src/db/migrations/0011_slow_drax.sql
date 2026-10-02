CREATE TABLE `experiment` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`start_date` text NOT NULL,
	`baseline_days` integer NOT NULL,
	`elimination_days` integer NOT NULL,
	`challenge_days` integer NOT NULL,
	`observation_days` integer NOT NULL,
	`status` text NOT NULL,
	`verdict_json` text,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
