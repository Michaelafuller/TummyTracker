CREATE TABLE `day_factor` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`sleep` text,
	`stress` integer,
	`alcohol` text,
	`caffeine` text,
	`period` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_factor_date_unique` ON `day_factor` (`date`);