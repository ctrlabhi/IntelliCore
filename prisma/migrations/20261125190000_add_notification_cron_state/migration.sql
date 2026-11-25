-- CreateTable
CREATE TABLE `notification_cron_state` (
    `key` VARCHAR(60) NOT NULL,
    `cursors` JSON NOT NULL,
    `lease_token` VARCHAR(36) NULL,
    `lease_until` DATETIME(3) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
