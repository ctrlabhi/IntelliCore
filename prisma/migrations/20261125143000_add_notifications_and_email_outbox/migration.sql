-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(36) NOT NULL,
    `recipient_user_id` VARCHAR(36) NOT NULL,
    `event_type` VARCHAR(60) NOT NULL,
    `category` ENUM('ACCOUNT', 'INTERNSHIP', 'ATTENDANCE', 'LEAVE', 'TASK', 'LEARNING', 'ANNOUNCEMENT') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `message` VARCHAR(600) NOT NULL,
    `related_resource_type` VARCHAR(40) NOT NULL,
    `related_resource_id` VARCHAR(36) NOT NULL,
    `action_path` VARCHAR(255) NOT NULL,
    `deduplication_key` CHAR(64) NOT NULL,
    `onboarding` BOOLEAN NOT NULL DEFAULT false,
    `read_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notifications_deduplication_key_key`(`deduplication_key`),
    INDEX `notifications_recipient_user_id_archived_at_read_at_created__idx`(`recipient_user_id`, `archived_at`, `read_at`, `created_at`),
    INDEX `notifications_recipient_user_id_category_created_at_idx`(`recipient_user_id`, `category`, `created_at`),
    INDEX `notifications_event_type_related_resource_id_idx`(`event_type`, `related_resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_preferences` (
    `user_id` VARCHAR(36) NOT NULL,
    `email_enabled` BOOLEAN NOT NULL DEFAULT true,
    `task_reminders` BOOLEAN NOT NULL DEFAULT true,
    `learning_updates` BOOLEAN NOT NULL DEFAULT true,
    `announcements` BOOLEAN NOT NULL DEFAULT true,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_outbox` (
    `id` VARCHAR(36) NOT NULL,
    `recipient_user_id` VARCHAR(36) NOT NULL,
    `recipient_email` VARCHAR(191) NOT NULL,
    `notification_id` VARCHAR(36) NOT NULL,
    `template_key` VARCHAR(60) NOT NULL,
    `template_version` INTEGER NOT NULL DEFAULT 1,
    `template_data` JSON NOT NULL,
    `authorization` JSON NOT NULL,
    `deduplication_key` CHAR(64) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'SENT', 'FAILED', 'CANCELLED', 'CAPTURED') NOT NULL DEFAULT 'PENDING',
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `maximum_attempts` INTEGER NOT NULL DEFAULT 5,
    `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `next_attempt_at` DATETIME(3) NOT NULL,
    `processing_started_at` DATETIME(3) NULL,
    `lease_expires_at` DATETIME(3) NULL,
    `worker_id` VARCHAR(36) NULL,
    `sent_at` DATETIME(3) NULL,
    `provider_message_id` VARCHAR(191) NULL,
    `last_error_code` VARCHAR(60) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_outbox_notification_id_key`(`notification_id`),
    UNIQUE INDEX `email_outbox_deduplication_key_key`(`deduplication_key`),
    INDEX `email_outbox_status_next_attempt_at_id_idx`(`status`, `next_attempt_at`, `id`),
    INDEX `email_outbox_status_lease_expires_at_idx`(`status`, `lease_expires_at`),
    INDEX `email_outbox_recipient_user_id_created_at_idx`(`recipient_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_delivery_attempts` (
    `id` VARCHAR(36) NOT NULL,
    `email_outbox_id` VARCHAR(36) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `outcome` VARCHAR(32) NOT NULL,
    `error_code` VARCHAR(60) NULL,
    `provider_message_id` VARCHAR(191) NULL,

    UNIQUE INDEX `email_delivery_attempts_email_outbox_id_sequence_key`(`email_outbox_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(36) NOT NULL,
    `created_by` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NULL,
    `title` VARCHAR(160) NOT NULL,
    `message` TEXT NOT NULL,
    `audience_type` ENUM('ALL_ACTIVE_USERS', 'STAFF', 'INTERNS', 'DEPARTMENT', 'SELECTED_USERS') NOT NULL,
    `selected_users` JSON NOT NULL,
    `scheduled_audience` JSON NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `revision` INTEGER NOT NULL DEFAULT 1,
    `scheduled_at` DATETIME(3) NULL,
    `published_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `announcements_status_scheduled_at_idx`(`status`, `scheduled_at`),
    INDEX `announcements_department_id_created_at_idx`(`department_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcement_recipients` (
    `announcement_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `notification_id` VARCHAR(36) NOT NULL,
    `received_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `announcement_recipients_notification_id_key`(`notification_id`),
    INDEX `announcement_recipients_user_id_received_at_idx`(`user_id`, `received_at`),
    PRIMARY KEY (`announcement_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_worker_state` (
    `id` VARCHAR(60) NOT NULL,
    `mode` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `heartbeat_at` DATETIME(3) NOT NULL,
    `last_error_code` VARCHAR(60) NULL,

    INDEX `notification_worker_state_heartbeat_at_idx`(`heartbeat_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_notification_id_fkey` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_delivery_attempts` ADD CONSTRAINT `email_delivery_attempts_email_outbox_id_fkey` FOREIGN KEY (`email_outbox_id`) REFERENCES `email_outbox`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement_recipients` ADD CONSTRAINT `announcement_recipients_announcement_id_fkey` FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement_recipients` ADD CONSTRAINT `announcement_recipients_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement_recipients` ADD CONSTRAINT `announcement_recipients_notification_id_fkey` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
