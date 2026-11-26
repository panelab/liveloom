CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`account_id` text NOT NULL,
	`username` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text,
	`expires_at` integer,
	`scopes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_user_platform_idx` ON `connections` (`user_id`,`platform`);--> statement-breakpoint
CREATE TABLE `device_codes` (
	`device_code_hash` text PRIMARY KEY NOT NULL,
	`user_code` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`client_name` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_codes_user_code_unique` ON `device_codes` (`user_code`);--> statement-breakpoint
ALTER TABLE `channels` ADD `ingest_health` text;--> statement-breakpoint
ALTER TABLE `destinations` ADD `connection_id` text;