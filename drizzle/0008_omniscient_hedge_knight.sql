CREATE TABLE `game_room_presence` (
	`room_id` text NOT NULL,
	`player_id` text NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_room_presence_player_unique` ON `game_room_presence` (`room_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `game_room_presence_seen_idx` ON `game_room_presence` (`room_id`,`last_seen`);