CREATE TABLE IF NOT EXISTS `saved_game_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_record_id` text,
	`title` text NOT NULL,
	`game` text NOT NULL,
	`mode` text NOT NULL,
	`board_size` integer NOT NULL,
	`black_name` text NOT NULL,
	`white_name` text NOT NULL,
	`winner` text NOT NULL,
	`reason` text NOT NULL,
	`viewer_role` text NOT NULL,
	`file_json` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `saved_game_records_user_recent_idx` ON `saved_game_records` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `saved_game_records_user_source_unique` ON `saved_game_records` (`user_id`,`source_record_id`);
