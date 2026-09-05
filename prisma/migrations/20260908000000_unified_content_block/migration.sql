-- Unified content block: one or two images + text + up to three buttons,
-- delivered as a single WhatsApp message.
--
-- Purely additive. Every new column is nullable, the enum only gains a value,
-- and the legacy `media*` / `cta*` columns are left in place so allocations and
-- in-flight blast jobs created before this migration keep sending exactly what
-- they always sent. Table names use the same casing as the initial migration so
-- the SQL is valid on case-sensitive filesystems too.

-- AlterTable: Campaign — new content-block columns + RICH enum value
ALTER TABLE `Campaign`
  ADD COLUMN `image1Key` VARCHAR(512) NULL,
  ADD COLUMN `image1Mime` VARCHAR(127) NULL,
  ADD COLUMN `image2Key` VARCHAR(512) NULL,
  ADD COLUMN `image2Mime` VARCHAR(127) NULL,
  ADD COLUMN `buttons` JSON NULL,
  MODIFY `messageType` ENUM('TEXT', 'IMAGE', 'BUTTON', 'RICH') NOT NULL DEFAULT 'TEXT';

-- AlterTable: BlastJob — matching immutable snapshot columns
ALTER TABLE `BlastJob`
  ADD COLUMN `snapshotImage1Key` VARCHAR(512) NULL,
  ADD COLUMN `snapshotImage1Mime` VARCHAR(127) NULL,
  ADD COLUMN `snapshotImage2Key` VARCHAR(512) NULL,
  ADD COLUMN `snapshotImage2Mime` VARCHAR(127) NULL,
  ADD COLUMN `snapshotButtons` JSON NULL,
  MODIFY `snapshotMessageType` ENUM('TEXT', 'IMAGE', 'BUTTON', 'RICH') NOT NULL DEFAULT 'TEXT';

-- Backfill: mirror legacy content onto the unified block so an admin opening an
-- existing allocation sees its image and button already in the new editor. The
-- legacy columns are intentionally left untouched, and `messageType` is *not*
-- promoted to RICH: the sender keeps using the legacy path for these rows until
-- an admin saves the allocation again.
UPDATE `Campaign`
SET `image1Key` = `mediaKey`,
    `image1Mime` = `mediaMime`
WHERE `mediaKey` IS NOT NULL AND `mediaKey` <> ''
  AND `mediaMime` IS NOT NULL AND `mediaMime` <> ''
  AND `image1Key` IS NULL;

UPDATE `Campaign`
SET `buttons` = JSON_ARRAY(
      JSON_OBJECT('variant', 'URL', 'label', `ctaLabel`, 'value', `ctaUrl`)
    )
WHERE `ctaLabel` IS NOT NULL AND `ctaLabel` <> ''
  AND `ctaUrl` IS NOT NULL AND `ctaUrl` <> ''
  AND `buttons` IS NULL;

-- Snapshots are immutable history, so they are mirrored the same way and never
-- rewritten: a running job continues to read its legacy snapshot fields.
UPDATE `BlastJob`
SET `snapshotImage1Key` = `snapshotMediaKey`,
    `snapshotImage1Mime` = `snapshotMediaMime`
WHERE `snapshotMediaKey` IS NOT NULL AND `snapshotMediaKey` <> ''
  AND `snapshotMediaMime` IS NOT NULL AND `snapshotMediaMime` <> ''
  AND `snapshotImage1Key` IS NULL;

UPDATE `BlastJob`
SET `snapshotButtons` = JSON_ARRAY(
      JSON_OBJECT('variant', 'URL', 'label', `snapshotCtaLabel`, 'value', `snapshotCtaUrl`)
    )
WHERE `snapshotCtaLabel` IS NOT NULL AND `snapshotCtaLabel` <> ''
  AND `snapshotCtaUrl` IS NOT NULL AND `snapshotCtaUrl` <> ''
  AND `snapshotButtons` IS NULL;

