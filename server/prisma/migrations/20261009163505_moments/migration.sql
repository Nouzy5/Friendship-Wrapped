-- AlterTable
ALTER TABLE `photos` ADD COLUMN `moment_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `user_settings` ADD COLUMN `notify_moments` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `moments` (
    `id` CHAR(36) NOT NULL,
    `group_id` CHAR(36) NOT NULL,
    `created_by_id` CHAR(36) NULL,
    `title` VARCHAR(60) NOT NULL,
    `emoji` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ends_at` DATETIME(3) NOT NULL,

    INDEX `moments_group_id_created_at_id_idx`(`group_id`, `created_at`, `id`),
    INDEX `moments_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `photos_moment_id_created_at_id_idx` ON `photos`(`moment_id`, `created_at`, `id`);

-- AddForeignKey
ALTER TABLE `photos` ADD CONSTRAINT `photos_moment_id_fkey` FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moments` ADD CONSTRAINT `moments_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moments` ADD CONSTRAINT `moments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
