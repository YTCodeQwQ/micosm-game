CREATE INDEX `friendships_status_idx` ON `friendships` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `game_invites_invitee_idx` ON `game_invites` (`invitee_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `game_invites_room_idx` ON `game_invites` (`room_id`,`status`);--> statement-breakpoint
CREATE INDEX `user_presence_seen_idx` ON `user_presence` (`last_seen`);