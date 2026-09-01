import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { withRedis } from "@/lib/redis/client";
import { serverEnv } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";

/**
 * Health check (RULES.md §21).
 *
 * Unauthenticated callers receive a bare liveness answer. Detailed dependency
 * status requires the `HEALTH_CHECK_TOKEN` bearer token, so probe output cannot
 * be used to fingerprint the deployment.
 */
export const dynamic = "force-dynamic";

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  // `withRedis` returns the fallback when the breaker is open or the ping
  // fails, so an unreachable Redis reports `degraded` instead of throwing.
  const reply = await withRedis((client) => client.ping(), null as string | null);
  return reply === "PONG";
}

export async function GET(request: Request): Promise<NextResponse> {
  const env = serverEnv();

  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  const detailed = Boolean(
    env.HEALTH_CHECK_TOKEN && safeEqual(provided, env.HEALTH_CHECK_TOKEN),
  );

  if (!detailed) {
    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const [database, redisOk] = await Promise.all([checkDatabase(), checkRedis()]);
  const healthy = database && redisOk;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { database, redis: redisOk },
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
