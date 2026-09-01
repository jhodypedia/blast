import { describe, expect, it } from "vitest";

import {
  adminStopJobSchema,
  auditLogQuerySchema,
  reviewWalletChangeSchema,
  updateSettingSchema,
  userActionSchema,
} from "@/lib/validation/admin";
import {
  archiveTargetListSchema,
  createTargetListSchema,
} from "@/lib/validation/target";

/**
 * ADMIN-only input rules (RULES.md §5, §16, §17).
 *
 * These schemas are the outer boundary of every admin mutation, so the required
 * reasons and the setting-key allow list are asserted here.
 */

describe("userActionSchema", () => {
  it("requires a reason when suspending", () => {
    const result = userActionSchema.safeParse({
      userId: "clh1user0001",
      action: "SUSPEND",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("reason")),
      ).toBe(true);
    }
  });

  it("does not require a reason for a force logout", () => {
    const result = userActionSchema.safeParse({
      userId: "clh1user0001",
      action: "FORCE_LOGOUT",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown action", () => {
    const result = userActionSchema.safeParse({
      userId: "clh1user0001",
      action: "DELETE",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateSettingSchema", () => {
  it("accepts a known setting key", () => {
    const result = updateSettingSchema.safeParse({
      key: "device.max_per_user",
      value: "4",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown setting key", () => {
    const result = updateSettingSchema.safeParse({
      key: "device.unlimited",
      value: "true",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty value", () => {
    const result = updateSettingSchema.safeParse({
      key: "withdrawal.enabled",
      value: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("reviewWalletChangeSchema", () => {
  it("accepts approve and reject", () => {
    for (const decision of ["APPROVE", "REJECT"]) {
      expect(
        reviewWalletChangeSchema.safeParse({
          changeRequestId: "clh1req0001",
          decision,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects any other decision", () => {
    expect(
      reviewWalletChangeSchema.safeParse({
        changeRequestId: "clh1req0001",
        decision: "CANCEL",
      }).success,
    ).toBe(false);
  });
});

describe("adminStopJobSchema", () => {
  it("requires a substantive reason", () => {
    expect(
      adminStopJobSchema.safeParse({ blastJobId: "clh1job0001", reason: "no" })
        .success,
    ).toBe(false);

    expect(
      adminStopJobSchema.safeParse({
        blastJobId: "clh1job0001",
        reason: "Recipient complaint",
      }).success,
    ).toBe(true);
  });
});

describe("target list schemas", () => {
  it("upper-cases an optional country code", () => {
    const result = createTargetListSchema.safeParse({
      name: "October list",
      defaultCountryCode: "id",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultCountryCode).toBe("ID");
    }
  });

  it("rejects a three-letter country code", () => {
    const result = createTargetListSchema.safeParse({
      name: "October list",
      defaultCountryCode: "IDN",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a too-short list name", () => {
    expect(createTargetListSchema.safeParse({ name: "a" }).success).toBe(false);
  });

  it("accepts an archive request without a reason", () => {
    expect(
      archiveTargetListSchema.safeParse({ targetListId: "clh1list0001" })
        .success,
    ).toBe(true);
  });
});

describe("auditLogQuerySchema", () => {
  it("applies pagination defaults", () => {
    const result = auditLogQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it("caps the page size", () => {
    expect(auditLogQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});
