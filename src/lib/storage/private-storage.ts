import "server-only";

import { mkdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { serverEnv } from "@/lib/env";
import { validationError } from "@/lib/errors";
import {
  ACCEPTED_TARGET_EXTENSIONS,
  MAX_TARGET_FILE_BYTES,
} from "@/lib/constants";

/**
 * Private file storage (RULES.md §7).
 *
 * Uploads never touch `public/`. Paths are always derived from a server-generated
 * UUID plus a sanitised extension, so a hostile file name cannot escape the
 * storage root or be served directly.
 */

export type StorageArea = "targets" | "campaign-media";

function storageRoot(): string {
  // `turbopackIgnore` keeps the build from tracing the whole project: the path is
  // resolved at runtime from a validated env var, never from user input.
  return resolve(/* turbopackIgnore: true */ process.cwd(), serverEnv().PRIVATE_STORAGE_DIR);
}

/** Resolves a storage key to an absolute path, refusing traversal attempts. */
export function resolveStoragePath(storageKey: string): string {
  const root = storageRoot();
  const target = resolve(/* turbopackIgnore: true */ root, storageKey);

  if (target !== root && !target.startsWith(`${root}${sep()}`)) {
    throw new Error("Refusing to resolve a path outside the storage root");
  }
  return target;
}

function sep(): string {
  return process.platform === "win32" ? "\\" : "/";
}

/** Strips everything except a safe, lower-cased extension. */
export function safeExtension(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

/** Sanitises a display name for storage in the database. */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\- ]/g, "")
    .slice(0, 255)
    .trim();
}

/**
 * Validates and persists an uploaded target file.
 *
 * The stream is written straight to disk in chunks so a large upload never sits
 * fully in memory (RULES.md §10).
 */
export async function saveTargetUpload(params: {
  file: File;
  maxBytes?: number;
}): Promise<{ storageKey: string; absolutePath: string; byteSize: number }> {
  const maxBytes = params.maxBytes ?? MAX_TARGET_FILE_BYTES;
  const extension = safeExtension(params.file.name);

  if (!(ACCEPTED_TARGET_EXTENSIONS as readonly string[]).includes(extension)) {
    throw validationError("Only .txt and .csv files are accepted.", {
      file: ["Upload a .txt or .csv file"],
    });
  }

  if (params.file.size > maxBytes) {
    throw validationError("This file is too large.", {
      file: [`Maximum size is ${Math.floor(maxBytes / (1024 * 1024))} MB`],
    });
  }

  const relativeDir = join("targets", new Date().toISOString().slice(0, 10));
  const storageKey = join(relativeDir, `${randomUUID()}${extension}`);
  const absolutePath = resolveStoragePath(storageKey);

  await mkdir(resolveStoragePath(relativeDir), { recursive: true });

  const { createWriteStream } = await import("node:fs");
  const { Readable } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");

  const readable = Readable.fromWeb(
    params.file.stream() as Parameters<typeof Readable.fromWeb>[0],
  );

  await pipeline(readable, createWriteStream(absolutePath, { mode: 0o600 }));

  const written = await stat(absolutePath);

  if (written.size > maxBytes) {
    // Defence in depth: `File.size` can lie for streamed multipart bodies.
    const { unlink } = await import("node:fs/promises");
    await unlink(absolutePath);
    throw validationError("This file is too large.", {
      file: [`Maximum size is ${Math.floor(maxBytes / (1024 * 1024))} MB`],
    });
  }

  return { storageKey, absolutePath, byteSize: written.size };
}

/** Deletes a stored file. Missing files are treated as already removed. */
export async function deleteStoredFile(storageKey: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
  }
}
