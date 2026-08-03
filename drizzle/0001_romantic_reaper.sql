CREATE TABLE `matchmaking_queue` (
	`queue_key` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `black_name` text;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `white_name` text;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `mode` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `board_size` integer DEFAULT 0 NOT NULL;