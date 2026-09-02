import "server-only";

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import {
  normalizePhoneNumber,
  type NormalizationFailureReason,
} from "@/lib/phone/normalize";

/**
 * Streaming TXT/CSV target parser (RULES.md §10).
 *
 * The file is read line by line so a 500k-row upload never materialises in
 * memory. Rows are emitted in chunks for batch insertion by the import worker.
 */

/** Header names recognised as the phone column, in priority order. */
const PHONE_HEADER_CANDIDATES = [
  "phonenumber",
  "phone_number",
  "phone",
  "nomor",
  "nomorhp",
  "no_hp",
  "nohp",
  "whatsapp",
  "wa",
  "msisdn",
  "number",
];

export type ParsedChunk = {
  /** Deduplicated valid numbers within this chunk. */
  valid: Array<{ normalizedNumber: string; countryCode: string }>;
  invalid: Array<{
    rowNumber: number;
    reason: NormalizationFailureReason | "DUPLICATE" | "LIMIT_REACHED";
    /** Masked sample, safe for admin display. */
    sample: string;
  }>;
};

export type ParseTotals = {
  sourceRowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
};

/** Masks a raw cell value so invalid-row reports never leak full numbers. */
export function maskSample(raw: string): string {
  const trimmed = raw.trim().slice(0, 32);
  if (trimmed.length <= 4) {
    return trimmed;
  }
  const middle = "•".repeat(Math.min(trimmed.length - 4, 12));
  return `${trimmed.slice(0, 2)}${middle}${trimmed.slice(-2)}`;
}

/** Splits a CSV line honouring double-quoted fields. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/** Detects the delimiter from a header line. */
export function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;

  for (const candidate of candidates) {
    const count = splitCsvLine(headerLine, candidate).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }

  return best;
}

function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "");
}

/**
 * Picks the phone column from a header row.
 * Returns `null` when the first line is not a header (i.e. it is already data).
 */
export function resolvePhoneColumn(
  headerFields: string[],
): { index: number } | null {
  const normalised = headerFields.map(normaliseHeader);

  for (const candidate of PHONE_HEADER_CANDIDATES) {
    const index = normalised.indexOf(candidate);
    if (index !== -1) {
      return { index };
    }
  }

  // No recognised header. If any field looks like a number the row is data.
  const looksLikeData = normalised.some((field) =>
    /^\+?\d[\d\s().-]*$/.test(field),
  );
  return looksLikeData ? null : { index: 0 };
}

export type ParseOptions = {
  /** ISO-3166-1 alpha-2 default country for local numbers. */
  defaultCountry: string;
  /** Rows emitted per chunk. */
  chunkSize: number;
  /** Hard cap on accepted valid numbers; the rest are reported as invalid. */
  maxNumbers: number;
  /** Headerless CSV/TXT uploads must contain one number per row. */
  numbersOnly?: boolean;
};

/**
 * Parses a TXT/CSV file, yielding chunks of validated rows and returning the
 * aggregate totals.
 *
 * Deduplication uses a set of normalised numbers bounded by `maxNumbers`, so
 * memory stays proportional to the accepted count rather than the file size.
 */
export async function* parseTargetFile(
  filePath: string,
  options: ParseOptions,
): AsyncGenerator<ParsedChunk, ParseTotals, void> {
  const totals: ParseTotals = {
    sourceRowCount: 0,
    validCount: 0,
    invalidCount: 0,
    duplicateCount: 0,
  };

  const seen = new Set<string>();
  let chunk: ParsedChunk = { valid: [], invalid: [] };

  const isCsv = filePath.toLowerCase().endsWith(".csv");
  let delimiter = ",";
  let phoneColumn = 0;
  let headerResolved = !isCsv;
  let resolvedHeader = false;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const rawLine of lines) {
      const line = rawLine.replace(/^\uFEFF/, "").trim();
      if (line.length === 0) {
        continue;
      }

      if (!headerResolved) {
        headerResolved = true;
        delimiter = detectDelimiter(line);
        const resolved = resolvePhoneColumn(splitCsvLine(line, delimiter));
        if (resolved) {
          phoneColumn = resolved.index;
          resolvedHeader = true;
          // The line was a header row: skip it.
          continue;
        }
        // Not a header — fall through and treat this line as data.
      }

      totals.sourceRowCount += 1;

      const fields = isCsv ? splitCsvLine(line, delimiter) : [line];
      const rawValue = fields[phoneColumn] ?? "";

      if (options.numbersOnly && isCsv && !resolvedHeader && fields.length !== 1) {
        totals.invalidCount += 1;
        chunk.invalid.push({
          rowNumber: totals.sourceRowCount,
          reason: "NON_NUMERIC",
          sample: maskSample(line),
        });
        continue;
      }

      if (totals.validCount >= options.maxNumbers) {
        totals.invalidCount += 1;
        chunk.invalid.push({
          rowNumber: totals.sourceRowCount,
          reason: "LIMIT_REACHED",
          sample: maskSample(rawValue),
        });
      } else {
        const result = normalizePhoneNumber(rawValue, options.defaultCountry);

        if (!result.ok) {
          totals.invalidCount += 1;
          chunk.invalid.push({
            rowNumber: totals.sourceRowCount,
            reason: result.reason,
            sample: maskSample(rawValue),
          });
        } else if (seen.has(result.normalizedNumber)) {
          totals.duplicateCount += 1;
          chunk.invalid.push({
            rowNumber: totals.sourceRowCount,
            reason: "DUPLICATE",
            sample: maskSample(rawValue),
          });
        } else {
          seen.add(result.normalizedNumber);
          totals.validCount += 1;
          chunk.valid.push({
            normalizedNumber: result.normalizedNumber,
            countryCode: result.countryCode,
          });
        }
      }

      if (chunk.valid.length + chunk.invalid.length >= options.chunkSize) {
        yield chunk;
        chunk = { valid: [], invalid: [] };
      }
    }

    if (chunk.valid.length > 0 || chunk.invalid.length > 0) {
      yield chunk;
    }
  } finally {
    lines.close();
    stream.destroy();
  }

  return totals;
}
