-- AlterTable
ALTER TABLE `user_settings` ADD COLUMN `notify_nudges` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `nudge_checked_on` CHAR(10) NULL,
    ADD COLUMN `nudged_at` DATETIME(3) NULL;
