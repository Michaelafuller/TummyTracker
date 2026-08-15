CREATE TABLE `watchlist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_item_term_unique` ON `watchlist_item` (`term`);