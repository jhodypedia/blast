import { NextResponse } from "next/server";

import { currentActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { readDeviceChallenge } from "@/lib/device/challenge-store";
import { cuidSchema } from "@/lib/validation/common";

/**
 * Error codes the adapter emits while it is still making progress, so the UI can
 * show the mandatory post-pairing socket rebuild (WhatsApp status 515) as work in
 * flight rather than as a failure.
 */
const RESTARTING_CODES = new Set(["PAIRED", "RESTART_REQUIRED"]);

/** Never cached: the payload carries a short-lived pairing challenge. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const actor = await currentActor();
  if (!actor || actor.role !== "USER" || actor.status !== "ACTIVE") {
    return NextResponse.json({ message: "Tidak terautentikasi." }, { status: 401 });
  }

  const { deviceId } = await params;
  if (!cuidSchema.safeParse(deviceId).success) {
    return NextResponse.json({ message: "Perangkat tidak valid." }, { status: 400 });
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId: actor.id, deletedAt: null },
    select: { id: true, label: true, status: true, lastErrorCode: true },
  });
  if (!device) {
    return NextResponse.json({ message: "Perangkat tidak ditemukan." }, { status: 404 });
  }

  const devicePayload = {
    id: device.id,
    label: device.label,
    status: device.status,
    errorCode: device.lastErrorCode,
    restarting:
      device.status === "CONNECTING" &&
      RESTARTING_CODES.has(device.lastErrorCode ?? ""),
  };

  const challenge = await readDeviceChallenge(device.id);
  if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { device: devicePayload, challenge: null },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json({
    device: devicePayload,
    challenge:
      challenge.method === "QR"
        ? { method: "QR", qr: challenge.qr, expiresAt: challenge.expiresAt }
        : { method: "PAIR_CODE", pairCode: challenge.pairCode, expiresAt: challenge.expiresAt },
  }, { headers: NO_STORE });
}