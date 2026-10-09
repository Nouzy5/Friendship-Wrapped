-- CreateTable
CREATE TABLE `apns_devices` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `session_id` CHAR(64) NOT NULL,
    `token` VARCHAR(200) NOT NULL,
    `environment` ENUM('SANDBOX', 'PRODUCTION') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `apns_devices_token_key`(`token`),
    INDEX `apns_devices_user_id_idx`(`user_id`),
    INDEX `apns_devices_session_id_idx`(`session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `apns_devices` ADD CONSTRAINT `apns_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `apns_devices` ADD CONSTRAINT `apns_devices_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
