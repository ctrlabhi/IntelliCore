-- CreateTable
CREATE TABLE `task_score_amendments` (
    `id` VARCHAR(36) NOT NULL,
    `review_id` VARCHAR(36) NOT NULL,
    `amended_by` VARCHAR(36) NOT NULL,
    `revision` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `criterion_scores` JSON NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `task_score_amendments_review_id_revision_key`(`review_id`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_progress_corrections` (
    `id` VARCHAR(36) NOT NULL,
    `progress_id` VARCHAR(36) NOT NULL,
    `corrected_by` VARCHAR(36) NOT NULL,
    `revision` INTEGER NOT NULL,
    `before_state` JSON NOT NULL,
    `after_state` JSON NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `learning_progress_corrections_progress_id_revision_key`(`progress_id`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `task_score_amendments` ADD CONSTRAINT `task_score_amendments_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `task_reviews`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_score_amendments` ADD CONSTRAINT `task_score_amendments_amended_by_fkey` FOREIGN KEY (`amended_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_progress_corrections` ADD CONSTRAINT `learning_progress_corrections_progress_id_fkey` FOREIGN KEY (`progress_id`) REFERENCES `learning_progress`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_progress_corrections` ADD CONSTRAINT `learning_progress_corrections_corrected_by_fkey` FOREIGN KEY (`corrected_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
