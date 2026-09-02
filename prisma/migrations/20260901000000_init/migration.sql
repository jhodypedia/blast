-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `sessionEpoch` INTEGER NOT NULL DEFAULT 0,
    `lastLoginAt` DATETIME(3) NULL,
    `suspendedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_status_idx`(`role`, `status`),
    INDEX `User_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `User_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Device` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `status` ENUM('CONNECTING', 'CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR') NOT NULL DEFAULT 'DISCONNECTED',
    `phoneNumber` VARCHAR(24) NULL,
    `credentialsCiphertext` TEXT NULL,
    `lastConnectedAt` DATETIME(3) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `reconnectAttempts` INTEGER NOT NULL DEFAULT 0,
    `lastErrorCode` VARCHAR(64) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Device_userId_status_idx`(`userId`, `status`),
    INDEX `Device_status_lastSeenAt_idx`(`status`, `lastSeenAt`),
    INDEX `Device_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `Device_userId_phoneNumber_key`(`userId`, `phoneNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeviceAuthState` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `stateKey` VARCHAR(191) NOT NULL,
    `ciphertext` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeviceAuthState_deviceId_idx`(`deviceId`),
    UNIQUE INDEX `DeviceAuthState_deviceId_stateKey_key`(`deviceId`, `stateKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TargetList` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('UPLOADING', 'VALIDATING', 'PARSING', 'IMPORTING', 'READY', 'FAILED', 'ARCHIVED') NOT NULL DEFAULT 'UPLOADING',
    `uploadedByAdminId` VARCHAR(191) NOT NULL,
    `originalFileName` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(512) NULL,
    `byteSize` INTEGER NOT NULL DEFAULT 0,
    `sourceRowCount` INTEGER NOT NULL DEFAULT 0,
    `validCount` INTEGER NOT NULL DEFAULT 0,
    `invalidCount` INTEGER NOT NULL DEFAULT 0,
    `duplicateCount` INTEGER NOT NULL DEFAULT 0,
    `importedCount` INTEGER NOT NULL DEFAULT 0,
    `defaultCountryCode` VARCHAR(8) NOT NULL,
    `errorSummary` TEXT NULL,
    `importStartedAt` DATETIME(3) NULL,
    `importFinishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TargetList_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `TargetList_uploadedByAdminId_idx`(`uploadedByAdminId`),
    INDEX `TargetList_archivedAt_idx`(`archivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TargetNumber` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `targetListId` VARCHAR(191) NOT NULL,
    `normalizedNumber` VARCHAR(24) NOT NULL,
    `countryCode` VARCHAR(8) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TargetNumber_targetListId_id_idx`(`targetListId`, `id`),
    UNIQUE INDEX `TargetNumber_targetListId_normalizedNumber_key`(`targetListId`, `normalizedNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TargetInvalidRow` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `targetListId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `reason` VARCHAR(64) NOT NULL,
    `sample` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TargetInvalidRow_targetListId_id_idx`(`targetListId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `internalNotes` TEXT NULL,
    `createdByAdminId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'PARTIAL_FAILED', 'CANCELLED', 'EXPIRED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `archivedAt` DATETIME(3) NULL,
    `messageText` TEXT NOT NULL,
    `mediaKey` VARCHAR(512) NULL,
    `mediaMime` VARCHAR(127) NULL,
    `mediaCaption` TEXT NULL,
    `ctaLabel` VARCHAR(64) NULL,
    `ctaUrl` VARCHAR(2048) NULL,
    `contentVersion` INTEGER NOT NULL DEFAULT 1,
    `targetListId` VARCHAR(191) NOT NULL,
    `deviceModePolicy` ENUM('SINGLE_DEVICE', 'ALL_DEVICES') NOT NULL DEFAULT 'SINGLE_DEVICE',
    `allowedSpeeds` JSON NOT NULL,
    `payoutPerSend` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `quotaPerUser` INTEGER NOT NULL,
    `maxConcurrentJobs` INTEGER NOT NULL DEFAULT 1,
    `assignmentPolicy` ENUM('ALL_ELIGIBLE', 'SELECTED_USERS') NOT NULL DEFAULT 'ALL_ELIGIBLE',
    `allowUserPause` BOOLEAN NOT NULL DEFAULT true,
    `requireTermsAccept` BOOLEAN NOT NULL DEFAULT false,
    `retryLimit` INTEGER NOT NULL DEFAULT 2,
    `scheduledStartAt` DATETIME(3) NOT NULL,
    `scheduledEndAt` DATETIME(3) NOT NULL,
    `activatedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Campaign_status_scheduledStartAt_scheduledEndAt_idx`(`status`, `scheduledStartAt`, `scheduledEndAt`),
    INDEX `Campaign_targetListId_idx`(`targetListId`),
    INDEX `Campaign_createdByAdminId_idx`(`createdByAdminId`),
    INDEX `Campaign_archivedAt_idx`(`archivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CampaignAssignment_userId_idx`(`userId`),
    UNIQUE INDEX `CampaignAssignment_campaignId_userId_key`(`campaignId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlastJob` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'PARTIAL_FAILED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `submissionKey` VARCHAR(191) NOT NULL,
    `snapshotContentVersion` INTEGER NOT NULL,
    `snapshotMessageText` TEXT NOT NULL,
    `snapshotMediaKey` VARCHAR(512) NULL,
    `snapshotMediaMime` VARCHAR(127) NULL,
    `snapshotMediaCaption` TEXT NULL,
    `snapshotCtaLabel` VARCHAR(64) NULL,
    `snapshotCtaUrl` VARCHAR(2048) NULL,
    `snapshotPayoutPerSend` DECIMAL(18, 4) NOT NULL,
    `snapshotCurrency` VARCHAR(3) NOT NULL,
    `snapshotDeviceMode` ENUM('SINGLE_DEVICE', 'ALL_DEVICES') NOT NULL,
    `snapshotRetryLimit` INTEGER NOT NULL,
    `snapshotAllowUserPause` BOOLEAN NOT NULL,
    `speedSeconds` INTEGER NOT NULL,
    `quotaTotal` INTEGER NOT NULL,
    `requestedStopAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `stoppedByRole` ENUM('ADMIN', 'USER', 'SYSTEM') NULL,
    `stopReason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BlastJob_campaignId_status_idx`(`campaignId`, `status`),
    INDEX `BlastJob_userId_status_idx`(`userId`, `status`),
    INDEX `BlastJob_deviceId_status_idx`(`deviceId`, `status`),
    INDEX `BlastJob_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `BlastJob_userId_submissionKey_key`(`userId`, `submissionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignRecipient` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `campaignId` VARCHAR(191) NOT NULL,
    `blastJobId` VARCHAR(191) NULL,
    `normalizedNumber` VARCHAR(24) NOT NULL,
    `recipientRef` VARCHAR(64) NOT NULL,
    `status` ENUM('PENDING', 'CLAIMED', 'SENDING', 'SENT', 'RETRYABLE_FAILED', 'FAILED', 'CANCELLED', 'SKIPPED', 'UNKNOWN', 'RECONCILIATION_REQUIRED') NOT NULL DEFAULT 'PENDING',
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `workerId` VARCHAR(64) NULL,
    `lockedAt` DATETIME(3) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `nextAttemptAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `failureCategory` VARCHAR(64) NULL,
    `failureReason` VARCHAR(255) NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CampaignRecipient_idempotencyKey_key`(`idempotencyKey`),
    INDEX `CampaignRecipient_campaignId_status_idx`(`campaignId`, `status`),
    INDEX `CampaignRecipient_blastJobId_status_idx`(`blastJobId`, `status`),
    INDEX `CampaignRecipient_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
    INDEX `CampaignRecipient_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `CampaignRecipient_campaignId_blastJobId_status_idx`(`campaignId`, `blastJobId`, `status`),
    UNIQUE INDEX `CampaignRecipient_campaignId_normalizedNumber_key`(`campaignId`, `normalizedNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReconciliationEvent` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `blastJobId` VARCHAR(191) NOT NULL,
    `recipientId` BIGINT NOT NULL,
    `reason` VARCHAR(64) NOT NULL,
    `detail` TEXT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReconciliationEvent_blastJobId_resolvedAt_idx`(`blastJobId`, `resolvedAt`),
    INDEX `ReconciliationEvent_recipientId_idx`(`recipientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LedgerEntry` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('EARNING', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_SETTLEMENT', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT', 'WITHDRAWAL_FEE') NOT NULL,
    `status` ENUM('PENDING', 'SETTLED', 'REVERSED') NOT NULL DEFAULT 'SETTLED',
    `amount` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `sourceType` VARCHAR(32) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `blastJobId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `reason` VARCHAR(255) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LedgerEntry_idempotencyKey_key`(`idempotencyKey`),
    INDEX `LedgerEntry_userId_status_createdAt_idx`(`userId`, `status`, `createdAt`),
    INDEX `LedgerEntry_userId_type_idx`(`userId`, `type`),
    INDEX `LedgerEntry_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    INDEX `LedgerEntry_blastJobId_idx`(`blastJobId`),
    INDEX `LedgerEntry_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wallet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fullNameCiphertext` TEXT NOT NULL,
    `accountNumberCiphertext` TEXT NOT NULL,
    `accountNumberLast4` VARCHAR(4) NOT NULL,
    `providerCode` VARCHAR(32) NOT NULL,
    `providerName` VARCHAR(64) NOT NULL,
    `status` ENUM('ACTIVE', 'PENDING_REVIEW', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Wallet_userId_key`(`userId`),
    INDEX `Wallet_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletChangeRequest` (
    `id` VARCHAR(191) NOT NULL,
    `walletId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fullNameCiphertext` TEXT NOT NULL,
    `accountNumberCiphertext` TEXT NOT NULL,
    `accountNumberLast4` VARCHAR(4) NOT NULL,
    `providerCode` VARCHAR(32) NOT NULL,
    `providerName` VARCHAR(64) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedByAdminId` VARCHAR(191) NULL,
    `reviewNote` VARCHAR(255) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WalletChangeRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `WalletChangeRequest_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Withdrawal` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `amount` DECIMAL(18, 4) NOT NULL,
    `fee` DECIMAL(18, 4) NOT NULL,
    `netAmount` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `walletProviderCode` VARCHAR(32) NOT NULL,
    `walletProviderName` VARCHAR(64) NOT NULL,
    `walletAccountLast4` VARCHAR(4) NOT NULL,
    `holdIdempotencyKey` VARCHAR(191) NOT NULL,
    `releaseIdempotencyKey` VARCHAR(191) NULL,
    `reviewedByAdminId` VARCHAR(191) NULL,
    `adminNote` VARCHAR(255) NULL,
    `rejectionReason` VARCHAR(255) NULL,
    `processedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `payoutReference` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Withdrawal_holdIdempotencyKey_key`(`holdIdempotencyKey`),
    UNIQUE INDEX `Withdrawal_releaseIdempotencyKey_key`(`releaseIdempotencyKey`),
    INDEX `Withdrawal_userId_status_idx`(`userId`, `status`),
    INDEX `Withdrawal_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(96) NOT NULL,
    `value` JSON NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actorUserId` VARCHAR(191) NULL,
    `actorRole` ENUM('ADMIN', 'USER', 'SYSTEM') NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `resourceType` VARCHAR(48) NOT NULL,
    `resourceId` VARCHAR(191) NULL,
    `beforeSummary` JSON NULL,
    `afterSummary` JSON NULL,
    `reason` VARCHAR(255) NULL,
    `ipHash` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AuditLog_resourceType_resourceId_idx`(`resourceType`, `resourceId`),
    INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NULL,
    `event` VARCHAR(48) NOT NULL,
    `outcome` VARCHAR(16) NOT NULL,
    `ipHash` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SecurityLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `SecurityLog_event_createdAt_idx`(`event`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `blastJobId` VARCHAR(191) NOT NULL,
    `recipientId` BIGINT NOT NULL,
    `recipientRef` VARCHAR(64) NOT NULL,
    `event` VARCHAR(32) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `detail` VARCHAR(255) NULL,
    `workerId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeliveryLog_blastJobId_createdAt_idx`(`blastJobId`, `createdAt`),
    INDEX `DeliveryLog_createdAt_idx`(`createdAt`),
    INDEX `DeliveryLog_recipientId_idx`(`recipientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OperationalLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `scope` VARCHAR(32) NOT NULL,
    `level` VARCHAR(16) NOT NULL,
    `event` VARCHAR(64) NOT NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OperationalLog_scope_createdAt_idx`(`scope`, `createdAt`),
    INDEX `OperationalLog_level_createdAt_idx`(`level`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Device` ADD CONSTRAINT `Device_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeviceAuthState` ADD CONSTRAINT `DeviceAuthState_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TargetList` ADD CONSTRAINT `TargetList_uploadedByAdminId_fkey` FOREIGN KEY (`uploadedByAdminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TargetNumber` ADD CONSTRAINT `TargetNumber_targetListId_fkey` FOREIGN KEY (`targetListId`) REFERENCES `TargetList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TargetInvalidRow` ADD CONSTRAINT `TargetInvalidRow_targetListId_fkey` FOREIGN KEY (`targetListId`) REFERENCES `TargetList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_targetListId_fkey` FOREIGN KEY (`targetListId`) REFERENCES `TargetList`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignAssignment` ADD CONSTRAINT `CampaignAssignment_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignAssignment` ADD CONSTRAINT `CampaignAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlastJob` ADD CONSTRAINT `BlastJob_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlastJob` ADD CONSTRAINT `BlastJob_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlastJob` ADD CONSTRAINT `BlastJob_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignRecipient` ADD CONSTRAINT `CampaignRecipient_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignRecipient` ADD CONSTRAINT `CampaignRecipient_blastJobId_fkey` FOREIGN KEY (`blastJobId`) REFERENCES `BlastJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReconciliationEvent` ADD CONSTRAINT `ReconciliationEvent_blastJobId_fkey` FOREIGN KEY (`blastJobId`) REFERENCES `BlastJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_blastJobId_fkey` FOREIGN KEY (`blastJobId`) REFERENCES `BlastJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wallet` ADD CONSTRAINT `Wallet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletChangeRequest` ADD CONSTRAINT `WalletChangeRequest_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletChangeRequest` ADD CONSTRAINT `WalletChangeRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Withdrawal` ADD CONSTRAINT `Withdrawal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Setting` ADD CONSTRAINT `Setting_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecurityLog` ADD CONSTRAINT `SecurityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryLog` ADD CONSTRAINT `DeliveryLog_blastJobId_fkey` FOREIGN KEY (`blastJobId`) REFERENCES `BlastJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
