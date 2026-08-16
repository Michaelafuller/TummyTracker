CREATE TABLE `goal` (
	`id` text PRIMARY KEY NOT NULL,
	`nutrient` text NOT NULL,
	`direction` text NOT NULL,
	`threshold` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_nutrient_unique` ON `goal` (`nutrient`);