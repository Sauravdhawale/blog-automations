CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`title` text NOT NULL,
	`keyword` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`meta_title` text DEFAULT '' NOT NULL,
	`meta_description` text DEFAULT '' NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`sources` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`snapshot` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`approved_version` integer,
	`assignee` text NOT NULL,
	`reviewer` text,
	`asset_id` text,
	`author_id` integer,
	`wp_id` integer,
	`wp_url` text,
	`publish_at` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `articles_site_status` ON `articles` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`size` integer NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text,
	`article_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_site` ON `events` (`site_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`site_id` text NOT NULL,
	`author_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_unique` ON `memberships` (`user_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `revision_article` ON `revisions` (`article_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`day` text NOT NULL,
	`article_id` text NOT NULL,
	`status` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_once_per_day` ON `runs` (`schedule_id`,`day`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`title` text NOT NULL,
	`time` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`days` text DEFAULT '1,2,3,4,5' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`reviewer` text,
	`owner` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`niche` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`image_rules` text DEFAULT '' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`authors` text DEFAULT '[]' NOT NULL,
	`posts` text DEFAULT '[]' NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`credential` text,
	`connection` text DEFAULT 'Not connected' NOT NULL,
	`color` text DEFAULT '#001639' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`identity` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_identity` ON `users` (`identity`);