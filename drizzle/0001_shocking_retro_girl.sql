DROP INDEX `revision_article`;--> statement-breakpoint
CREATE UNIQUE INDEX `revision_article_version` ON `revisions` (`article_id`,`version`);--> statement-breakpoint
ALTER TABLE `articles` ADD `edit_token` text DEFAULT '' NOT NULL;