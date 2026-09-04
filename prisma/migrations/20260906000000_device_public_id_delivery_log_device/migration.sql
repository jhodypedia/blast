-- Operator-visible device identifier (`device-{userId}-{uuid}`) and per-device
-- delivery-log tracking. Both columns are added nullable and backfilled so the
-- migration is safe on a populated database.

-- AlterTable: Device.publicId
ALTER TABLE `Device` ADD COLUMN `publicId` VARCHAR(191) NULL;

UPDATE `Device`
SET `publicId` = CONCAT('device-', `userId`, '-', UUID())
WHERE `publicId` IS NULL;

ALTER TABLE `Device` MODIFY COLUMN `publicId` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `Device_publicId_key` ON `Device`(`publicId`);

-- AlterTable: DeliveryLog.deviceId
ALTER TABLE `DeliveryLog` ADD COLUMN `deviceId` VARCHAR(191) NULL;

UPDATE `DeliveryLog` `dl`
JOIN `BlastJob` `bj` ON `bj`.`id` = `dl`.`blastJobId`
SET `dl`.`deviceId` = `bj`.`deviceId`
WHERE `dl`.`deviceId` IS NULL;

CREATE INDEX `DeliveryLog_deviceId_createdAt_idx` ON `DeliveryLog`(`deviceId`, `createdAt`);

CREATE INDEX `DeliveryLog_status_createdAt_idx` ON `DeliveryLog`(`status`, `createdAt`);

ALTER TABLE `DeliveryLog`
  ADD CONSTRAINT `DeliveryLog_deviceId_fkey`
  FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
