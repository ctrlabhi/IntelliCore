-- CreateTable
CREATE TABLE `tasks` (
    `id` VARCHAR(36) NOT NULL,
    `task_code` VARCHAR(50) NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `created_by` VARCHAR(36) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `description` TEXT NOT NULL,
    `instructions` TEXT NOT NULL,
    `deliverables` TEXT NOT NULL,
    `resources` JSON NOT NULL,
    `rubric` JSON NOT NULL,
    `template_key` VARCHAR(100) NULL,
    `task_type` ENUM('INDIVIDUAL', 'DEPARTMENT') NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `available_from` DATETIME(3) NOT NULL,
    `due_at` DATETIME(3) NOT NULL,
    `maximum_score` INTEGER NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `published_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tasks_task_code_key`(`task_code`),
    INDEX `tasks_department_id_status_due_at_idx`(`department_id`, `status`, `due_at`),
    INDEX `tasks_published_at_idx`(`published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_assignments` (
    `id` VARCHAR(36) NOT NULL,
    `task_id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `assigned_to` VARCHAR(36) NOT NULL,
    `assigned_by` VARCHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `due_at` DATETIME(3) NULL,
    `status` ENUM('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ASSIGNED',
    `started_at` DATETIME(3) NULL,
    `submitted_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_assignments_assigned_to_status_idx`(`assigned_to`, `status`),
    INDEX `task_assignments_internship_id_assigned_at_idx`(`internship_id`, `assigned_at`),
    INDEX `task_assignments_status_assigned_at_idx`(`status`, `assigned_at`),
    UNIQUE INDEX `task_assignments_task_id_internship_id_key`(`task_id`, `internship_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_submissions` (
    `id` VARCHAR(36) NOT NULL,
    `assignment_id` VARCHAR(36) NOT NULL,
    `submitted_by` VARCHAR(36) NOT NULL,
    `submission_version` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `written_response` TEXT NULL,
    `project_url` VARCHAR(1500) NULL,
    `repository_url` VARCHAR(1500) NULL,
    `additional_links` JSON NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED') NOT NULL DEFAULT 'DRAFT',
    `deadline_at` DATETIME(3) NULL,
    `late` BOOLEAN NOT NULL DEFAULT false,
    `task_snapshot` JSON NULL,
    `submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `task_submissions_assignment_id_submission_version_key`(`assignment_id`, `submission_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_reviews` (
    `id` VARCHAR(36) NOT NULL,
    `submission_id` VARCHAR(36) NOT NULL,
    `reviewed_by` VARCHAR(36) NOT NULL,
    `decision` ENUM('APPROVED', 'REVISION_REQUESTED') NOT NULL,
    `score` INTEGER NULL,
    `maximum_score` INTEGER NULL,
    `criterion_scores` JSON NOT NULL,
    `feedback` TEXT NOT NULL,
    `reviewed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `task_reviews_submission_id_key`(`submission_id`),
    INDEX `task_reviews_reviewed_at_idx`(`reviewed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_attachments` (
    `id` VARCHAR(36) NOT NULL,
    `owner_user_id` VARCHAR(36) NOT NULL,
    `task_id` VARCHAR(36) NULL,
    `submission_id` VARCHAR(36) NULL,
    `storage_key` VARCHAR(36) NOT NULL,
    `original_filename` VARCHAR(160) NOT NULL,
    `mime_type` VARCHAR(80) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `checksum` CHAR(64) NOT NULL,
    `attachment_purpose` ENUM('TASK_RESOURCE', 'SUBMISSION') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `file_attachments_storage_key_key`(`storage_key`),
    INDEX `file_attachments_task_id_idx`(`task_id`),
    INDEX `file_attachments_submission_id_idx`(`submission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_tracks` (
    `id` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `track_key` VARCHAR(100) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_by` VARCHAR(36) NULL,
    `published_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `learning_tracks_department_id_status_idx`(`department_id`, `status`),
    UNIQUE INDEX `learning_tracks_department_id_track_key_version_key`(`department_id`, `track_key`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_modules` (
    `id` VARCHAR(36) NOT NULL,
    `learning_track_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `description` TEXT NOT NULL,
    `sequence` INTEGER NOT NULL,
    `estimated_minutes` INTEGER NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `learning_modules_learning_track_id_sequence_idx`(`learning_track_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lessons` (
    `id` VARCHAR(36) NOT NULL,
    `learning_module_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `content` TEXT NOT NULL,
    `sequence` INTEGER NOT NULL,
    `estimated_minutes` INTEGER NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `source_key` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lessons_learning_module_id_sequence_idx`(`learning_module_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_resources` (
    `id` VARCHAR(36) NOT NULL,
    `lesson_id` VARCHAR(36) NULL,
    `learning_module_id` VARCHAR(36) NULL,
    `title` VARCHAR(180) NOT NULL,
    `resource_url` VARCHAR(1500) NOT NULL,
    `description` TEXT NOT NULL,
    `sequence` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `learning_resources_lesson_id_sequence_idx`(`lesson_id`, `sequence`),
    INDEX `learning_resources_learning_module_id_sequence_idx`(`learning_module_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_enrollments` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `learning_track_id` VARCHAR(36) NOT NULL,
    `curriculum_version` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE',
    `enrolled_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `learning_enrollments_learning_track_id_status_idx`(`learning_track_id`, `status`),
    UNIQUE INDEX `learning_enrollments_internship_id_learning_track_id_key`(`internship_id`, `learning_track_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_progress` (
    `id` VARCHAR(36) NOT NULL,
    `learning_enrollment_id` VARCHAR(36) NOT NULL,
    `lesson_id` VARCHAR(36) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
    `started_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `learning_progress_lesson_id_idx`(`lesson_id`),
    UNIQUE INDEX `learning_progress_learning_enrollment_id_lesson_id_key`(`learning_enrollment_id`, `lesson_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_submissions` ADD CONSTRAINT `task_submissions_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `task_assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_submissions` ADD CONSTRAINT `task_submissions_submitted_by_fkey` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_reviews` ADD CONSTRAINT `task_reviews_submission_id_fkey` FOREIGN KEY (`submission_id`) REFERENCES `task_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_reviews` ADD CONSTRAINT `task_reviews_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_attachments` ADD CONSTRAINT `file_attachments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_attachments` ADD CONSTRAINT `file_attachments_submission_id_fkey` FOREIGN KEY (`submission_id`) REFERENCES `task_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_attachments` ADD CONSTRAINT `file_attachments_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_tracks` ADD CONSTRAINT `learning_tracks_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_tracks` ADD CONSTRAINT `learning_tracks_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_modules` ADD CONSTRAINT `learning_modules_learning_track_id_fkey` FOREIGN KEY (`learning_track_id`) REFERENCES `learning_tracks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_learning_module_id_fkey` FOREIGN KEY (`learning_module_id`) REFERENCES `learning_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_resources` ADD CONSTRAINT `learning_resources_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_resources` ADD CONSTRAINT `learning_resources_learning_module_id_fkey` FOREIGN KEY (`learning_module_id`) REFERENCES `learning_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_enrollments` ADD CONSTRAINT `learning_enrollments_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_enrollments` ADD CONSTRAINT `learning_enrollments_learning_track_id_fkey` FOREIGN KEY (`learning_track_id`) REFERENCES `learning_tracks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_progress` ADD CONSTRAINT `learning_progress_learning_enrollment_id_fkey` FOREIGN KEY (`learning_enrollment_id`) REFERENCES `learning_enrollments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_progress` ADD CONSTRAINT `learning_progress_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

