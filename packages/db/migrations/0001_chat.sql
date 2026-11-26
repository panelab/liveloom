ALTER TABLE `channels` ADD `chat_token` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `twitch_login` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `kick_slug` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `youtube_handle` text;--> statement-breakpoint
CREATE UNIQUE INDEX `channels_chat_token_unique` ON `channels` (`chat_token`);