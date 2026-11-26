CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ingest_key` text NOT NULL,
	`is_live` integer DEFAULT false NOT NULL,
	`live_since` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_user_id_unique` ON `channels` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_ingest_key_unique` ON `channels` (`ingest_key`);--> statement-breakpoint
CREATE TABLE `destination_status` (
	`destination_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`message` text,
	`bitrate_kbps` integer,
	`started_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`server_url` text NOT NULL,
	`stream_key_enc` text NOT NULL,
	`stream_key_hint` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `destinations_channel_idx` ON `destinations` (`channel_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);