CREATE TABLE `rank_matches` (
	`room_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`black_user_id` text NOT NULL,
	`white_user_id` text NOT NULL,
	`black_rating_before` integer NOT NULL,
	`white_rating_before` integer NOT NULL,
	`black_delta` integer,
	`white_delta` integer,
	`black_rating_after` integer,
	`white_rating_after` integer,
	`result` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`settled_at` integer
);
--> statement-breakpoint
CREATE INDEX `rank_matches_players_idx` ON `rank_matches` (`black_user_id`,`white_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `rank_profiles` (
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`peak_rating` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`matches` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_profiles_user_game_unique` ON `rank_profiles` (`user_id`,`game`);--> statement-breakpoint
CREATE INDEX `rank_profiles_leaderboard_idx` ON `rank_profiles` (`game`,`rating`,`wins`);--> statement-breakpoint
CREATE TABLE `ranked_queue` (
	`user_id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`player_id` text NOT NULL,
	`game` text NOT NULL,
	`board_size` integer NOT NULL,
	`rating` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ranked_queue_match_idx` ON `ranked_queue` (`game`,`board_size`,`rating`,`created_at`);