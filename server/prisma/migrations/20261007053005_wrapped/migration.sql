-- CreateTable
CREATE TABLE `wrapped` (
    `group_id` CHAR(36) NOT NULL,
    `year` SMALLINT NOT NULL,
    `time_zone` VARCHAR(64) NOT NULL,
    `stats` JSON NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`group_id`, `year`, `time_zone`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wrapped` ADD CONSTRAINT `wrapped_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
