-- CreateTable
CREATE TABLE `account_deletion_jobs` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `target_firebase_uid` VARCHAR(128) NOT NULL,
    `target_email` VARCHAR(191) NOT NULL,
    `target_name` VARCHAR(150) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    `reason` VARCHAR(500) NOT NULL,
    `preview_hash` VARCHAR(64) NULL,
    `impact_summary` JSON NULL,
    `requested_by` VARCHAR(36) NOT NULL,
    `requested_by_email` VARCHAR(191) NOT NULL,
    `failed_step` VARCHAR(100) NULL,
    `error_message` VARCHAR(1000) NULL,
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `account_deletion_jobs_user_id_idx`(`user_id`),
    INDEX `account_deletion_jobs_target_firebase_uid_idx`(`target_firebase_uid`),
    INDEX `account_deletion_jobs_target_email_idx`(`target_email`),
    INDEX `account_deletion_jobs_status_idx`(`status`),
    INDEX `account_deletion_jobs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
