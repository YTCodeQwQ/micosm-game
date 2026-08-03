ALTER TABLE `game_rooms` ADD `black_avatar` text;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `white_avatar` text;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `black_signature` text;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `white_signature` text;--> statement-breakpoint
ALTER TABLE `users` ADD `username_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `users` ADD `signature` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_key_unique` ON `users` (`username_key`);