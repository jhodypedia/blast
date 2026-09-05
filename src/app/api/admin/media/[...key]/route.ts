import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import { currentActor } from "@/lib/auth/session";
import { logger } from "@/lib/observability/logger";
import { resolveStoragePath } from "@/lib/storage/private-storage";

/**
 * Campaign media reader — ADMIN only.
 *
 * Campaign uploads live in private storage and must never be reachable from
 * `public/`, so the admin preview needs an authenticated route to render them.
 * Access is therefore gated on a verified ADMIN session (RULES.md §6, §7), the
 * key is confined to the campaign-media area, and `resolveStoragePath` refuses
 * anything that escapes the storage root.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Only image keys inside the campaign-media area may be served. */
function safeMediaKey(segments: string[]): string | null {
  if (segments.length === 0 || segments.length > 8) {
    return null;
  }

  // Each segment is validated individually, so no `..`, separator or NUL byte can
  // reach the filesystem regardless of how the URL was encoded.
  const clean = segments.every((segment) =>
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(segment) && segment !== "..",
  );

  if (!clean || segments[0] !== "campaign-media") {
    return null;
  }

  const last = segments[segments.length - 1] ?? "";
  const dot = last.lastIndexOf(".");
  const extension = dot >= 0 ? last.slice(dot).toLowerCase() : "";

  return extension in MIME_BY_EXTENSION ? segments.join("/") : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const actor = await currentActor();

  if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE") {
    return NextResponse.json({ message: "Tidak terautentikasi." }, { status: 401 });
  }

  const { key } = await params;
  const storageKey = safeMediaKey(key ?? []);

  if (!storageKey) {
    return NextResponse.json({ message: "Media tidak valid." }, { status: 400 });
  }

  const extension = storageKey.slice(storageKey.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_BY_EXTENSION[extension];

  if (!contentType) {
    return NextResponse.json({ message: "Media tidak valid." }, { status: 400 });
  }

  let absolutePath: string;
  try {
    absolutePath = resolveStoragePath(storageKey);
  } catch {
    // Traversal attempt: reported as "not found" so the route reveals nothing.
    return NextResponse.json({ message: "Media tidak ditemukan." }, { status: 404 });
  }

  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) {
      return NextResponse.json({ message: "Media tidak ditemukan." }, { status: 404 });
    }

    const body = Readable.toWeb(
      createReadStream(absolutePath),
    ) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": info.size.toString(),
        // Admin-only content: cached per session, never by a shared proxy.
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      logger("campaign").error(
        { event: "admin.media_read_failed" },
        "Failed to read campaign media",
      );
    }
    return NextResponse.json({ message: "Media tidak ditemukan." }, { status: 404 });
  }
}
