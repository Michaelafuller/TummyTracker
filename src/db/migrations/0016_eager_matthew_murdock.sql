CREATE TABLE `medication_reminder` (
	`id` text PRIMARY KEY NOT NULL,
	`medication_id` text NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`days_mask` integer DEFAULT 127 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `medication_reminder_medication_id_idx` ON `medication_reminder` (`medication_id`);