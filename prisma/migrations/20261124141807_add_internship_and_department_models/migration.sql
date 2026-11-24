-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_code_key`(`code`),
    UNIQUE INDEX `departments_slug_key`(`slug`),
    INDEX `departments_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_departments` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `assigned_role` VARCHAR(50) NOT NULL DEFAULT 'STAFF',
    `assigned_by` VARCHAR(36) NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `user_departments_department_id_idx`(`department_id`),
    INDEX `user_departments_user_id_idx`(`user_id`),
    UNIQUE INDEX `user_departments_user_id_department_id_assigned_role_key`(`user_id`, `department_id`, `assigned_role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_applications` (
    `id` VARCHAR(36) NOT NULL,
    `applicant_user_id` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `application_status` ENUM('DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
    `requested_start_date` DATETIME(3) NOT NULL,
    `requested_duration` VARCHAR(50) NOT NULL,
    `qualification` VARCHAR(150) NOT NULL,
    `institution` VARCHAR(150) NOT NULL,
    `course` VARCHAR(150) NULL,
    `specialization` VARCHAR(150) NULL,
    `graduation_year` INTEGER NULL,
    `skills` TEXT NULL,
    `motivation` TEXT NULL,
    `contact_number` VARCHAR(20) NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_by` VARCHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `internship_applications_applicant_user_id_idx`(`applicant_user_id`),
    INDEX `internship_applications_department_id_idx`(`department_id`),
    INDEX `internship_applications_application_status_idx`(`application_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internships` (
    `id` VARCHAR(36) NOT NULL,
    `internship_code` VARCHAR(50) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `application_id` VARCHAR(36) NOT NULL,
    `department_id` VARCHAR(36) NOT NULL,
    `assigned_team_leader_id` VARCHAR(36) NULL,
    `position_title` VARCHAR(100) NOT NULL,
    `commencement_date` DATETIME(3) NOT NULL,
    `expected_completion_date` DATETIME(3) NOT NULL,
    `actual_completion_date` DATETIME(3) NULL,
    `duration` VARCHAR(50) NULL,
    `work_mode` VARCHAR(20) NOT NULL DEFAULT 'REMOTE',
    `internship_status` ENUM('APPROVED', 'ONGOING', 'COMPLETION_REVIEW', 'COMPLETED', 'TERMINATED', 'WITHDRAWN') NOT NULL DEFAULT 'APPROVED',
    `approved_by` VARCHAR(36) NULL,
    `approved_at` DATETIME(3) NULL,
    `completion_approved_by` VARCHAR(36) NULL,
    `completion_approved_at` DATETIME(3) NULL,
    `termination_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `internships_internship_code_key`(`internship_code`),
    UNIQUE INDEX `internships_application_id_key`(`application_id`),
    INDEX `internships_user_id_idx`(`user_id`),
    INDEX `internships_department_id_idx`(`department_id`),
    INDEX `internships_assigned_team_leader_id_idx`(`assigned_team_leader_id`),
    INDEX `internships_internship_status_idx`(`internship_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_departments` ADD CONSTRAINT `user_departments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_departments` ADD CONSTRAINT `user_departments_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_applications` ADD CONSTRAINT `internship_applications_applicant_user_id_fkey` FOREIGN KEY (`applicant_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_applications` ADD CONSTRAINT `internship_applications_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `internship_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_assigned_team_leader_id_fkey` FOREIGN KEY (`assigned_team_leader_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
