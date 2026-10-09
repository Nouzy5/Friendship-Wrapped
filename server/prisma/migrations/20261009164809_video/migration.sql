-- AlterTable
ALTER TABLE `photos` ADD COLUMN `kind` ENUM('PHOTO', 'VIDEO') NOT NULL DEFAULT 'PHOTO',
    ADD COLUMN `video_duration_ms` INTEGER NULL,
    ADD COLUMN `video_is_live` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `video_key` VARCHAR(255) NULL,
    ADD COLUMN `video_size_bytes` INTEGER NULL;
