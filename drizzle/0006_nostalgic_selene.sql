CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text,
	`body` text DEFAULT '' NOT NULL,
	`room_id` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `chat_messages_world_idx` ON `chat_messages` (`channel`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_messages_direct_idx` ON `chat_messages` (`sender_id`,`recipient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_reads` (
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`peer_id` text DEFAULT '' NOT NULL,
	`last_read_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_reads_channel_unique` ON `chat_reads` (`user_id`,`channel`,`peer_id`);--> statement-breakpoint
CREATE TABLE `chat_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_reports_unique` ON `chat_reports` (`message_id`,`reporter_id`);