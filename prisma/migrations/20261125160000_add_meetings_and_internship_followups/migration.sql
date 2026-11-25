-- AlterTable
ALTER TABLE `internships` MODIFY `application_id` VARCHAR(36) NULL;

-- AlterTable
ALTER TABLE `notifications` MODIFY `category` ENUM('MEETING', 'ACCOUNT', 'INTERNSHIP', 'ATTENDANCE', 'LEAVE', 'TASK', 'LEARNING', 'ANNOUNCEMENT') NOT NULL;

-- CreateTable
CREATE TABLE `certificate_dispatch_history` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `actor_id` VARCHAR(36) NOT NULL,
    `request_key` VARCHAR(36) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `status` ENUM('SENT', 'NOT_SENT') NOT NULL,
    `declared_sent_at` DATETIME(3) NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` VARCHAR(500) NULL,

    UNIQUE INDEX `certificate_dispatch_history_internship_id_request_key_key`(`internship_id`, `request_key`),
    UNIQUE INDEX `certificate_dispatch_history_internship_id_sequence_key`(`internship_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_extensions` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `continuation_id` VARCHAR(36) NULL,
    `actor_id` VARCHAR(36) NOT NULL,
    `previous_end` DATE NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `remarks` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelled_at` DATETIME(3) NULL,
    `cancellation_note` VARCHAR(500) NULL,

    UNIQUE INDEX `internship_extensions_continuation_id_key`(`continuation_id`),
    INDEX `internship_extensions_internship_id_created_at_idx`(`internship_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_promotions` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `continuation_id` VARCHAR(36) NULL,
    `department_id` VARCHAR(36) NULL,
    `requested_by` VARCHAR(36) NOT NULL,
    `decided_by` VARCHAR(36) NULL,
    `designation` VARCHAR(100) NOT NULL,
    `target_role` VARCHAR(40) NULL,
    `effective_on` DATE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PROVISIONED') NOT NULL,
    `decision_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decided_at` DATETIME(3) NULL,
    `provisioned_at` DATETIME(3) NULL,
    `provisioned_staff_id` VARCHAR(36) NULL,

    INDEX `internship_promotions_internship_id_created_at_idx`(`internship_id`, `created_at`),
    INDEX `internship_promotions_continuation_id_effective_on_idx`(`continuation_id`, `effective_on`),
    INDEX `internship_promotions_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meetings` (
    `id` VARCHAR(36) NOT NULL,
    `meeting_code` VARCHAR(50) NOT NULL,
    `organizer_id` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `audience_type` ENUM('ALL_ACTIVE_USERS', 'STAFF', 'INTERNS', 'DEPARTMENT', 'SELECTED_USERS') NOT NULL,
    `selected_user_ids` JSON NOT NULL,
    `creation_mode` ENUM('MANUAL', 'GOOGLE_CALENDAR') NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(40) NOT NULL DEFAULT 'Asia/Kolkata',
    `meeting_url` VARCHAR(255) NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 0,
    `provider_sync_status` ENUM('NOT_REQUIRED', 'PENDING', 'PROCESSING', 'READY', 'FAILED', 'SYNC_REQUIRED') NOT NULL DEFAULT 'NOT_REQUIRED',
    `provider_event_id` VARCHAR(64) NULL,
    `conference_request_id` VARCHAR(64) NULL,
    `calendar_connection_id` VARCHAR(36) NULL,
    `sync_attempts` INTEGER NOT NULL DEFAULT 0,
    `sync_after` DATETIME(3) NULL,
    `sync_lease` VARCHAR(36) NULL,
    `sync_error` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancellation_reason` VARCHAR(500) NULL,

    UNIQUE INDEX `meetings_meeting_code_key`(`meeting_code`),
    UNIQUE INDEX `meetings_provider_event_id_key`(`provider_event_id`),
    UNIQUE INDEX `meetings_conference_request_id_key`(`conference_request_id`),
    INDEX `meetings_status_start_at_idx`(`status`, `start_at`),
    INDEX `meetings_department_id_status_idx`(`department_id`, `status`),
    INDEX `meetings_provider_sync_status_sync_after_idx`(`provider_sync_status`, `sync_after`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meeting_participants` (
    `meeting_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `response` ENUM('INVITED', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'INVITED',
    `invited_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `response_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `join_requested_at` DATETIME(3) NULL,

    INDEX `meeting_participants_user_id_revoked_at_idx`(`user_id`, `revoked_at`),
    PRIMARY KEY (`meeting_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_connections` (
    `id` VARCHAR(36) NOT NULL,
    `organizer_id` VARCHAR(36) NOT NULL,
    `calendar_id` VARCHAR(255) NOT NULL,
    `encrypted_token` TEXT NULL,
    `scope` VARCHAR(255) NOT NULL,
    `connected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `disconnected_at` DATETIME(3) NULL,

    UNIQUE INDEX `calendar_connections_organizer_id_calendar_id_key`(`organizer_id`, `calendar_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_authorizations` (
    `id` VARCHAR(64) NOT NULL,
    `organizer_id` VARCHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `calendar_authorizations_expires_at_idx`(`expires_at`),
    INDEX `calendar_authorizations_organizer_id_idx`(`organizer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `certificate_dispatch_history` ADD CONSTRAINT `certificate_dispatch_history_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate_dispatch_history` ADD CONSTRAINT `certificate_dispatch_history_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_extensions` ADD CONSTRAINT `internship_extensions_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_extensions` ADD CONSTRAINT `internship_extensions_continuation_id_fkey` FOREIGN KEY (`continuation_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_extensions` ADD CONSTRAINT `internship_extensions_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_promotions` ADD CONSTRAINT `internship_promotions_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_promotions` ADD CONSTRAINT `internship_promotions_continuation_id_fkey` FOREIGN KEY (`continuation_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_promotions` ADD CONSTRAINT `internship_promotions_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_promotions` ADD CONSTRAINT `internship_promotions_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_promotions` ADD CONSTRAINT `internship_promotions_decided_by_fkey` FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_promotions` ADD CONSTRAINT `internship_promotions_provisioned_staff_id_fkey` FOREIGN KEY (`provisioned_staff_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_calendar_connection_id_fkey` FOREIGN KEY (`calendar_connection_id`) REFERENCES `calendar_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_participants` ADD CONSTRAINT `meeting_participants_meeting_id_fkey` FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_participants` ADD CONSTRAINT `meeting_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_connections` ADD CONSTRAINT `calendar_connections_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_authorizations` ADD CONSTRAINT `calendar_authorizations_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
