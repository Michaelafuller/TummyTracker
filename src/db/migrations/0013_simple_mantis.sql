CREATE TABLE `saved_meal` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`type` text NOT NULL,
	`meal_slot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_meal_name_key_unique` ON `saved_meal` (`name_key`);--> statement-breakpoint
CREATE TABLE `saved_meal_component` (
	`id` text PRIMARY KEY NOT NULL,
	`saved_meal_id` text NOT NULL,
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
CREATE INDEX `saved_meal_component_saved_meal_id_idx` ON `saved_meal_component` (`saved_meal_id`);