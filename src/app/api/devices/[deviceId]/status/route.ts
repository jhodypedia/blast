import { NextResponse } from "next/server";

import { currentActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { readDeviceChallenge } from "@/lib/device/challenge-store";
import { cuidSchema } from "@/lib/validation/common";

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

  const challenge = await readDeviceChallenge(device.id);
  if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ device: { id: device.id, label: device.label, status: device.status, errorCode: device.lastErrorCode }, challenge: null });
  }

  return NextResponse.json({
    device: { id: device.id, label: device.label, status: device.status, errorCode: device.lastErrorCode },
    challenge:
      challenge.method === "QR"
        ? { method: "QR", qr: challenge.qr, expiresAt: challenge.expiresAt }
        : { method: "PAIR_CODE", pairCode: challenge.pairCode, expiresAt: challenge.expiresAt },
  }, { headers: { "Cache-Control": "no-store" } });
}