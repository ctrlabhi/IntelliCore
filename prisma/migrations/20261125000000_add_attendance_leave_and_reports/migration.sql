-- CreateTable
CREATE TABLE `attendance_policies` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    `working_days` JSON NOT NULL,
    `check_in_time` CHAR(5) NOT NULL DEFAULT '09:30',
    `check_out_time` CHAR(5) NOT NULL DEFAULT '18:30',
    `report_deadline` CHAR(5) NOT NULL DEFAULT '20:00',
    `grace_minutes` INTEGER NOT NULL DEFAULT 0,
    `requires_daily_report` BOOLEAN NOT NULL DEFAULT true,
    `effective_from` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `attendance_policies_effective_from_key`(`effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_eligibility` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `first_date` DATE NOT NULL,
    `last_date` DATE NOT NULL,

    INDEX `attendance_eligibility_internship_id_ends_at_idx`(`internship_id`, `ends_at`),
    INDEX `attendance_eligibility_first_date_last_date_idx`(`first_date`, `last_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `business_date` DATE NOT NULL,
    `policy_id` VARCHAR(36) NOT NULL,
    `check_in_at` DATETIME(3) NULL,
    `check_out_at` DATETIME(3) NULL,
    `source` ENUM('DASHBOARD', 'CORRECTION') NOT NULL DEFAULT 'DASHBOARD',
    `revision` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_business_date_idx`(`business_date`),
    UNIQUE INDEX `attendance_internship_id_business_date_key`(`internship_id`, `business_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_work_reports` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `business_date` DATE NOT NULL,
    `work_completed` TEXT NOT NULL,
    `learning_summary` TEXT NOT NULL,
    `progress_summary` TEXT NOT NULL,
    `blockers` TEXT NOT NULL,
    `next_day_plan` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'REVIEWED') NOT NULL DEFAULT 'DRAFT',
    `submitted_at` DATETIME(3) NULL,
    `late_approved_at` DATETIME(3) NULL,
    `reviewed_by` VARCHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `daily_work_reports_business_date_status_idx`(`business_date`, `status`),
    UNIQUE INDEX `daily_work_reports_internship_id_business_date_key`(`internship_id`, `business_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `id` VARCHAR(36) NOT NULL,
    `internship_id` VARCHAR(36) NOT NULL,
    `leave_type` ENUM('SICK_LEAVE', 'CASUAL_LEAVE', 'EMERGENCY_LEAVE', 'OTHER') NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `working_days` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `reconciled_activity` BOOLEAN NOT NULL DEFAULT false,
    `reviewed_by` VARCHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_remarks` TEXT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `leave_requests_internship_id_status_start_date_end_date_idx`(`internship_id`, `status`, `start_date`, `end_date`),
    INDEX `leave_requests_status_start_date_idx`(`status`, `start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_corrections` (
    `id` VARCHAR(36) NOT NULL,
    `attendance_id` VARCHAR(36) NOT NULL,
    `requested_by` VARCHAR(36) NOT NULL,
    `kind` ENUM('TIMESTAMPS', 'LATE_REPORT') NOT NULL,
    `original_values` JSON NOT NULL,
    `proposed_changes` JSON NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by` VARCHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `resolution_remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_corrections_attendance_id_status_idx`(`attendance_id`, `status`),
    INDEX `attendance_corrections_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendance_eligibility` ADD CONSTRAINT `attendance_eligibility_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `attendance_policies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_work_reports` ADD CONSTRAINT `daily_work_reports_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_work_reports` ADD CONSTRAINT `daily_work_reports_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_corrections` ADD CONSTRAINT `attendance_corrections_attendance_id_fkey` FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_corrections` ADD CONSTRAINT `attendance_corrections_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_corrections` ADD CONSTRAINT `attendance_corrections_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed policy and start known eligibility at deployment without assigning historical obligations.
INSERT INTO `attendance_policies` (`id`, `name`, `working_days`, `effective_from`)
VALUES ('ab221680-f03e-4e36-810f-faf13a0a0705', 'Standard IST working week', JSON_ARRAY(1, 2, 3, 4, 5), '1970-01-01');

INSERT INTO `attendance_eligibility` (`id`, `internship_id`, `starts_at`, `first_date`, `last_date`)
SELECT UUID(), i.id, UTC_TIMESTAMP(3), DATE(i.commencement_date), DATE(i.expected_completion_date)
FROM `internships` i
JOIN `users` u ON u.id = i.user_id
WHERE i.internship_status IN ('APPROVED', 'ONGOING') AND u.status = 'ACTIVE' AND u.email_verified = TRUE
  AND DATE(i.expected_completion_date) >= DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE)
  AND NOT EXISTS (SELECT 1 FROM staff_profiles s WHERE s.user_id = u.id)
  AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'INTERN')
  AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code <> 'INTERN');
