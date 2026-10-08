-- AlterTable
ALTER TABLE `group_members` ADD COLUMN `color` ENUM('LIME', 'COBALT', 'TOMATO', 'SUN', 'BUBBLEGUM', 'MINT', 'LILAC', 'PLUM', 'SKY', 'FOREST', 'TANGERINE', 'CHERRY') NULL,
    ADD COLUMN `muted` BOOLEAN NOT NULL DEFAULT false;

-- Backfill: the first 12 members of each group, by join date, get the palette's colours in order.
UPDATE `group_members` AS gm
JOIN (
    SELECT `group_id`, `user_id`,
           ROW_NUMBER() OVER (PARTITION BY `group_id` ORDER BY `joined_at`, `user_id`) AS n
    FROM `group_members`
) AS ranked ON ranked.`group_id` = gm.`group_id` AND ranked.`user_id` = gm.`user_id`
SET gm.`color` = ELT(ranked.n, 'LIME', 'COBALT', 'TOMATO', 'SUN', 'BUBBLEGUM', 'MINT', 'LILAC', 'PLUM', 'SKY', 'FOREST', 'TANGERINE', 'CHERRY')
WHERE ranked.n <= 12;

-- AlterTable
ALTER TABLE `groups` ADD COLUMN `avatar_key` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `last_active_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `user_agent` VARCHAR(255) NULL;

-- Backfill: existing sessions were last known to be active when they were created.
UPDATE `sessions` SET `last_active_at` = `created_at`;

-- CreateTable
CREATE TABLE `user_settings` (
    `user_id` CHAR(36) NOT NULL,
    `allow_photo_saving` BOOLEAN NOT NULL DEFAULT true,
    `show_in_wrapped` BOOLEAN NOT NULL DEFAULT true,
    `time_zone` VARCHAR(64) NULL,
    `notifications_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notify_photos` BOOLEAN NOT NULL DEFAULT true,
    `notify_reactions` BOOLEAN NOT NULL DEFAULT true,
    `notify_comments` BOOLEAN NOT NULL DEFAULT true,
    `notify_members` BOOLEAN NOT NULL DEFAULT false,
    `notify_on_this_day` BOOLEAN NOT NULL DEFAULT true,
    `notify_wrapped` BOOLEAN NOT NULL DEFAULT true,
    `quiet_hours_enabled` BOOLEAN NOT NULL DEFAULT true,
    `quiet_hours_start` CHAR(5) NOT NULL DEFAULT '23:00',
    `quiet_hours_end` CHAR(5) NOT NULL DEFAULT '08:00',
    `on_this_day_checked_on` CHAR(10) NULL,
    `wrapped_announced_year` SMALLINT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blocks` (
    `blocker_id` CHAR(36) NOT NULL,
    `blocked_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `blocks_blocked_id_idx`(`blocked_id`),
    PRIMARY KEY (`blocker_id`, `blocked_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` CHAR(36) NOT NULL,
    `reporter_id` CHAR(36) NOT NULL,
    `photo_id` CHAR(36) NULL,
    `reported_user_id` CHAR(36) NULL,
    `message` VARCHAR(1000) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reports_reporter_id_idx`(`reporter_id`),
    INDEX `reports_photo_id_idx`(`photo_id`),
    INDEX `reports_reported_user_id_idx`(`reported_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `endpoint` VARCHAR(700) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `push_subscriptions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_queue` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `tag` VARCHAR(100) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` VARCHAR(300) NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `deliver_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_queue_deliver_at_idx`(`deliver_at`),
    UNIQUE INDEX `notification_queue_user_id_tag_key`(`user_id`, `tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `group_members_group_id_color_key` ON `group_members`(`group_id`, `color`);

-- AddForeignKey
ALTER TABLE `user_settings` ADD CONSTRAINT `user_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blocks` ADD CONSTRAINT `blocks_blocker_id_fkey` FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blocks` ADD CONSTRAINT `blocks_blocked_id_fkey` FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporter_id_fkey` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_photo_id_fkey` FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reported_user_id_fkey` FOREIGN KEY (`reported_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_queue` ADD CONSTRAINT `notification_queue_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
