-- Baileys message shape (TEXT / IMAGE / BUTTON) for admin-configured target
-- allocations, plus the matching immutable snapshot on every blast job.
--
-- Both columns are added with a default so the migration is safe on a populated
-- database, then backfilled from the content that is already stored: a row with
-- media is an image message, a row with a complete CTA is a button message and
-- everything else stays a plain text message.

-- AlterTable: Campaign.messageType
ALTER TABLE `Campaign`
  ADD COLUMN `messageType` ENUM('TEXT', 'IMAGE', 'BUTTON') NOT NULL DEFAULT 'TEXT';

UPDATE `Campaign`
SET `messageType` = 'IMAGE'
WHERE `mediaKey` IS NOT NULL AND `mediaKey` <> '';

UPDATE `Campaign`
SET `messageType` = 'BUTTON'
WHERE (`mediaKey` IS NULL OR `mediaKey` = '')
  AND `ctaLabel` IS NOT NULL AND `ctaLabel` <> ''
  AND `ctaUrl` IS NOT NULL AND `ctaUrl` <> '';

-- AlterTable: BlastJob.snapshotMessageType
ALTER TABLE `BlastJob`
  ADD COLUMN `snapshotMessageType` ENUM('TEXT', 'IMAGE', 'BUTTON') NOT NULL DEFAULT 'TEXT';

UPDATE `BlastJob`
SET `snapshotMessageType` = 'IMAGE'
WHERE `snapshotMediaKey` IS NOT NULL AND `snapshotMediaKey` <> '';

UPDATE `BlastJob`
SET `snapshotMessageType` = 'BUTTON'
WHERE (`snapshotMediaKey` IS NULL OR `snapshotMediaKey` = '')
  AND `snapshotCtaLabel` IS NOT NULL AND `snapshotCtaLabel` <> ''
  AND `snapshotCtaUrl` IS NOT NULL AND `snapshotCtaUrl` <> '';
