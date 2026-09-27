CREATE TABLE `medication` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_dose` real,
	`dose_unit` text,
	`frequency` text,
	`start_date` integer,
	`end_date` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `medication_dose` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`medication_id` text NOT NULL,
	`dose` real NOT NULL,
	`dose_unit` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `medication_dose_event_id_idx` ON `medication_dose` (`event_id`);--> statement-breakpoint
CREATE INDEX `medication_dose_medication_id_idx` ON `medication_dose` (`medication_id`);--> statement-breakpoint
CREATE TABLE `medication_event` (
	`id` text PRIMARY KEY NOT NULL,
	`taken_at` integer NOT NULL,
	`time_known` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
