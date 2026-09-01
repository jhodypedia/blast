import { describe, expect, it } from "vitest";

import {
  detectDelimiter,
  maskSample,
  resolvePhoneColumn,
  splitCsvLine,
} from "@/lib/target/parser";

/** CSV parsing helpers (RULES.md §10). */
describe("splitCsvLine", () => {
  it("splits a simple row", () => {
    expect(splitCsvLine("a,b,c", ",")).toEqual(["a", "b", "c"]);
  });

  it("honours quoted fields containing the delimiter", () => {
    expect(splitCsvLine('"Doe, Jane",081234567890', ",")).toEqual([
      "Doe, Jane",
      "081234567890",
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(splitCsvLine('"say ""hi""",1', ",")).toEqual(['say "hi"', "1"]);
  });

  it("preserves empty trailing fields", () => {
    expect(splitCsvLine("a,,", ",")).toEqual(["a", "", ""]);
  });
});

describe("detectDelimiter", () => {
  it("detects a semicolon header", () => {
    expect(detectDelimiter("name;phone;note")).toBe(";");
  });

  it("detects a tab header", () => {
    expect(detectDelimiter("name\tphone")).toBe("\t");
  });

  it("falls back to a comma", () => {
    expect(detectDelimiter("phone")).toBe(",");
  });
});

describe("resolvePhoneColumn", () => {
  it("finds the phone column by a known header name", () => {
    expect(resolvePhoneColumn(["name", "phoneNumber", "city"])).toEqual({
      index: 1,
    });
  });

  it("recognises the Indonesian header 'nomor'", () => {
    expect(resolvePhoneColumn(["nama", "Nomor"])).toEqual({ index: 1 });
  });

  it("returns null when the first line is already data", () => {
    expect(resolvePhoneColumn(["081234567890"])).toBeNull();
  });

  it("falls back to the first column for an unrecognised header", () => {
    expect(resolvePhoneColumn(["target", "label"])).toEqual({ index: 0 });
  });
});

describe("maskSample", () => {
  it("never echoes a full number", () => {
    const masked = maskSample("081234567890");
    expect(masked).not.toContain("1234567");
    expect(masked.startsWith("08")).toBe(true);
    expect(masked.endsWith("90")).toBe(true);
  });

  it("leaves a very short value intact", () => {
    expect(maskSample("12")).toBe("12");
  });
});
