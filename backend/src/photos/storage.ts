import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Chore-proof photos on disk.
 *
 * The bytes never go into Postgres. A household accumulates a photo per chore
 * per day, which is a few thousand files a year - fine on a filesystem, and it
 * keeps pg_dump small enough that the Stage 15 backup stays a quick operation
 * rather than something that has to be scheduled around.
 */

/** Refuse anything bigger than this after the client has downscaled it. */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/**
 * Sniffed from the bytes, never from the Content-Type header the client sent.
 * A browser will happily label anything, and this file gets written to disk and
 * served back later.
 */
export type PhotoFormat = 'jpeg' | 'png' | 'webp';

export function detectFormat(bytes: Buffer): PhotoFormat | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }

  return null;
}

export const MIME_FOR: Record<PhotoFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const EXTENSION_FOR: Record<PhotoFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

export interface StoredPhoto {
  /** Relative to the storage root. This is what goes in the database. */
  filePath: string;
  byteSize: number;
  sha256: string;
  format: PhotoFormat;
}

/**
 * Writes one photo and returns what the database needs.
 *
 * Sharded by household date so no single directory grows without bound, and so
 * pruning or archiving old proof is a matter of deleting whole folders rather
 * than querying for candidates.
 */
export async function storePhoto(
  storageRoot: string,
  bytes: Buffer,
  choreDate: string,
): Promise<StoredPhoto> {
  const format = detectFormat(bytes);
  if (!format) throw new Error('Not a recognised image.');

  const [year, month, day] = choreDate.split('-') as [string, string, string];
  // randomUUID, not the hash: two children photographing the same blank counter
  // would otherwise collide on a content-addressed name, and deleting one
  // chore's proof would silently remove the other's.
  const filePath = [year, month, day, `${randomUUID()}.${EXTENSION_FOR[format]}`].join('/');
  const absolute = join(storageRoot, filePath);

  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes, { flag: 'wx' });

  return {
    filePath,
    byteSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    format,
  };
}

/**
 * Resolves a stored path against the root and refuses anything that escapes it.
 *
 * These paths are generated above rather than supplied by anyone, so this is a
 * belt-and-braces check - but it is the one place a bad value would turn into
 * reading an arbitrary file off the laptop, so it is worth being certain.
 */
export function resolveStoredPath(storageRoot: string, filePath: string): string {
  const root = resolve(storageRoot);
  const absolute = resolve(root, filePath);

  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new Error('Refusing a photo path outside the storage directory.');
  }
  return absolute;
}

export async function deletePhoto(storageRoot: string, filePath: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(storageRoot, filePath));
  } catch {
    // Already gone is the desired end state.
  }
}

export function formatFromPath(filePath: string): PhotoFormat {
  if (filePath.endsWith('.png')) return 'png';
  if (filePath.endsWith('.webp')) return 'webp';
  return 'jpeg';
}
