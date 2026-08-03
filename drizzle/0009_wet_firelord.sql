ALTER TABLE `game_rooms` ADD `black_user_id` text;--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `white_user_id` text;--> statement-breakpoint
UPDATE `game_rooms` SET
  `black_user_id` = CASE
    WHEN `white_player` IS NULL THEN `host_user_id`
    ELSE COALESCE(
      (SELECT `id` FROM `users` WHERE `display_name` = `game_rooms`.`black_name` LIMIT 1),
      CASE json_extract(`state`, '$.hostColorPreference')
        WHEN 'black' THEN `host_user_id`
        WHEN 'white' THEN `guest_user_id`
      END
    )
  END,
  `white_user_id` = CASE
    WHEN `white_player` IS NULL THEN NULL
    ELSE COALESCE(
      (SELECT `id` FROM `users` WHERE `display_name` = `game_rooms`.`white_name` LIMIT 1),
      CASE json_extract(`state`, '$.hostColorPreference')
        WHEN 'black' THEN `guest_user_id`
        WHEN 'white' THEN `host_user_id`
      END
    )
  END;
