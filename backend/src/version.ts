import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The version actually running, read from package.json rather than repeated in
 * a constant beside it.
 *
 * Two copies of a version number are one copy and one lie: the constant this
 * replaces said 0.1.0 while System status said "0.1.0 (Stage 2 preview)", four
 * stages after Stage 2. A number nobody updates is worse than no number, because
 * it is the thing somebody reads when they are trying to work out whether the
 * laptop is running what they just deployed.
 */
function readVersion(): string {
  // Walks up from wherever this file ended up - src/ under tsx, dist/ when
  // compiled - so the same code works either way.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 4; depth += 1) {
    try {
      const raw = readFileSync(join(dir, 'package.json'), 'utf8');
      const parsed = JSON.parse(raw) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // Not here; try the parent.
    }
    dir = dirname(dir);
  }
  return 'unknown';
}

export const APP_VERSION = readVersion();
