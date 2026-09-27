CREATE TABLE `day_check_in` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_check_in_date_unique` ON `day_check_in` (`date`);