CREATE TABLE `friendships` (
	`user_low` text NOT NULL,
	`user_high` text NOT NULL,
	`requested_by` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendships_pair_unique` ON `friendships` (`user_low`,`user_high`);--> statement-breakpoint
CREATE TABLE `game_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`invitee_id` text NOT NULL,
	`room_id` text NOT NULL,
	`game` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `host_user_id` text;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `guest_user_id` text;