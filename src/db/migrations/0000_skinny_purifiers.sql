CREATE TABLE `log_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`meal_slot` text,
	`name` text NOT NULL,
	`barcode` text,
	`logged_at` integer NOT NULL,
	`sentiment` integer,
	`notes` text,
	`calories` real,
	`fat_g` real,
	`carbs_g` real,
	`protein_g` real,
	`fiber_g` real,
	`sugar_g` real,
	`sodium_mg` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
