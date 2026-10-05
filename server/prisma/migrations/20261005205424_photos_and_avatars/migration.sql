-- AlterTable
ALTER TABLE `users` ADD COLUMN `avatar_key` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `photos` (
    `id` CHAR(36) NOT NULL,
    `group_id` CHAR(36) NOT NULL,
    `uploader_id` CHAR(36) NOT NULL,
    `caption` VARCHAR(500) NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `medium_key` VARCHAR(255) NOT NULL,
    `thumbnail_key` VARCHAR(255) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `photos_group_id_created_at_id_idx`(`group_id`, `created_at`, `id`),
    INDEX `photos_uploader_id_created_at_idx`(`uploader_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `photos` ADD CONSTRAINT `photos_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photos` ADD CONSTRAINT `photos_uploader_id_fkey` FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
