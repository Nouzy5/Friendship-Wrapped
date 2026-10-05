-- CreateTable
CREATE TABLE `groups` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `emoji` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_members` (
    `group_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role` ENUM('OWNER', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `group_members_user_id_idx`(`user_id`),
    PRIMARY KEY (`group_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invite_tokens` (
    `id` CHAR(64) NOT NULL,
    `group_id` CHAR(36) NOT NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `invite_tokens_group_id_idx`(`group_id`),
    INDEX `invite_tokens_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invite_tokens` ADD CONSTRAINT `invite_tokens_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invite_tokens` ADD CONSTRAINT `invite_tokens_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
