CREATE TABLE `game_room_spectators` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_room_spectators_user_unique` ON `game_room_spectators` (`room_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `game_room_spectators_seen_idx` ON `game_room_spectators` (`room_id`,`last_seen`);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `hall` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `spectator_policy` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
CREATE INDEX `game_rooms_lobby_idx` ON `game_rooms` (`mode`,`spectator_policy`,`updated_at`);