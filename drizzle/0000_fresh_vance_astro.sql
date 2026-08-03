CREATE TABLE `game_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`black_player` text NOT NULL,
	`white_player` text,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
