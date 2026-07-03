CREATE TABLE `meal_component` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`servings` real DEFAULT 1 NOT NULL,
	`serving_g` real,
	`calories` real,
	`fat_g` real,
	`saturated_fat_g` real,
	`carbs_g` real,
	`protein_g` real,
	`fiber_g` real,
	`sugar_g` real,
	`sodium_mg` real,
	`ingredients_text` text,
	`tags_json` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_component_entry_id_idx` ON `meal_component` (`entry_id`);--> statement-breakpoint
ALTER TABLE `log_entry` ADD `component_count` integer;