import "server-only";

import { unlink } from "node:fs/promises";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { parseTargetFile } from "@/lib/target/parser";
import { resolveStoragePath } from "@/lib/storage/private-storage";
import {
  MAX_TARGET_NUMBERS,
  TARGET_IMPORT_CHUNK_SIZE,
} from "@/lib/constants";
import type { TargetImportJobData } from "@/lib/queue/queues";

/**
 * Target import processor (RULES.md §10).
 *
 * The file is streamed and inserted in batches; nothing is buffered whole. The
 * unique `(targetListId, normalizedNumber)` constraint plus `skipDuplicates`
 * makes a retried batch a no-op rather than a duplicate.
 */
export async function processTargetImport(
  data: TargetImportJobData,
): Promise<void> {
  const log = logger("target");
  const absolutePath = resolveStoragePath(data.storageKey);

  await prisma.targetList.update({
    where: { id: data.targetListId },
    data: { status: "PARSING", importStartedAt: new Date() },
  });

  try {
    const iterator = parseTargetFile(absolutePath, {
      defaultCountry: data.defaultCountryCode,
      chunkSize: TARGET_IMPORT_CHUNK_SIZE,
      // One number costs far fewer than one byte of file, so the byte cap is a
      // safe upper bound for the row cap as well.
      maxNumbers: MAX_TARGET_NUMBERS,
      numbersOnly: true,
    });

    await prisma.targetList.update({
      where: { id: data.targetListId },
      data: { status: "IMPORTING" },
    });

    let imported = 0;
    let next = await iterator.next();

    while (!next.done) {
      const chunk = next.value;

      if (chunk.valid.length > 0) {
        const result = await prisma.targetNumber.createMany({
          data: chunk.valid.map((entry) => ({
            targetListId: data.targetListId,
            normalizedNumber: entry.normalizedNumber,
            countryCode: entry.countryCode,
          })),
          skipDuplicates: true,
        });
        imported += result.count;
      }

      if (chunk.invalid.length > 0) {
        await prisma.targetInvalidRow.createMany({
          data: chunk.invalid.map((entry) => ({
            targetListId: data.targetListId,
            rowNumber: entry.rowNumber,
            reason: entry.reason,
            sample: entry.sample,
          })),
        });
      }

      next = await iterator.next();
    }

    const totals = next.value;

    await prisma.targetList.update({
      where: { id: data.targetListId },
      data: {
        status: "READY",
        sourceRowCount: totals.sourceRowCount,
        validCount: totals.validCount,
        invalidCount: totals.invalidCount,
        duplicateCount: totals.duplicateCount,
        importedCount: imported,
        importFinishedAt: new Date(),
        errorSummary: null,
      },
    });

    log.info(
      {
        event: "target.import_completed",
        targetListId: data.targetListId,
        imported,
        invalid: totals.invalidCount,
        duplicates: totals.duplicateCount,
      },
      "Target import finished",
    );
  } catch (error) {
    // Only a sanitised summary is stored; raw parser output may echo file data.
    await prisma.targetList.update({
      where: { id: data.targetListId },
      data: {
        status: "FAILED",
        importFinishedAt: new Date(),
        errorSummary:
          "The file could not be imported. Check the format and try again.",
      },
    });

    log.error(
      {
        event: "target.import_failed",
        targetListId: data.targetListId,
        reason: error instanceof Error ? error.name : "unknown",
      },
      "Target import failed",
    );

    throw error;
  } finally {
    // The original upload is not needed once rows are imported.
    try {
      await unlink(absolutePath);
    } catch {
      // Already removed; nothing to do.
    }

    await prisma.targetList.updateMany({
      where: { id: data.targetListId },
      data: { storageKey: null },
    });
  }
}
