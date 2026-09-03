import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Idempotent seed.
 *
 * Creates the bootstrap ADMIN and the default settings rows. The admin password
 * must be supplied through `BOOTSTRAP_ADMIN_PASSWORD`; it is never hard-coded
 * (RULES.md §5, §2).
 */

const SETTING_DEFAULTS: Array<{ key: string; value: unknown }> = [
  { key: "device.max_per_user", value: 5 },
  { key: "device.pair_code_enabled", value: true },
  { key: "device.qr_enabled", value: true },
  { key: "device.inactivity_days", value: 30 },
  { key: "target.default_country_code", value: "ID" },
  { key: "target.max_file_bytes", value: 20 * 1024 * 1024 },
  { key: "withdrawal.min_amount", value: "50000" },
  { key: "withdrawal.fee", value: "0" },
  { key: "withdrawal.enabled", value: true },
  { key: "auth.registration_enabled", value: true },
  { key: "auth.session_hours", value: 8 },
  { key: "platform.maintenance_mode", value: { enabled: false, message: "" } },
  { key: "blast.allowed_speeds", value: [1, 3, 6, 10] },
  { key: "blast.max_active_jobs_per_user", value: 2 },
  { key: "blast.default_payout_per_send", value: "25" },
  { key: "blast.default_currency", value: "IDR" },
  { key: "retention.delivery_log_days", value: 30 },
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the seed");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
  });

  try {
    for (const setting of SETTING_DEFAULTS) {
      await prisma.setting.upsert({
        where: { key: setting.key },
        create: { key: setting.key, value: setting.value as never },
        // Existing values are administrator choices; do not overwrite them.
        update: {},
      });
    }
    console.log(`Ensured ${SETTING_DEFAULTS.length} settings rows.`);

    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase().trim();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Platform Admin";

    if (!email || !password) {
      console.log(
        "Skipping admin bootstrap: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create it.",
      );
      return;
    }

    if (password.length < 10) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters");
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (existing) {
      console.log(`Admin account already exists (${existing.role}).`);
      return;
    }

    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
        status: "ACTIVE",
      },
      select: { id: true },
    });

    console.log(`Created ADMIN account for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
