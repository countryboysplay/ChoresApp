import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * PIN hashing.
 *
 * scrypt from node:crypto, not argon2 or bcrypt. It is a memory-hard KDF built
 * into Node, so there is no native module to rebuild every time Node updates on
 * the laptop - argon2 wants node-gyp, which on Windows means a Visual Studio
 * toolchain that has to keep working unattended for years.
 *
 * Be clear-eyed about what this does and does not buy. A 4-digit PIN has 10,000
 * possibilities; no KDF makes that unguessable, and an attacker holding the
 * database can exhaust the space whatever the cost factor. The hash exists so a
 * leaked backup does not hand over PINs that a child probably also uses on a
 * phone lock screen. The control that actually stops guessing is the lockout in
 * ./lockout.ts.
 */

// Hand-written rather than promisify(): promisify resolves to scrypt's
// three-argument overload, which drops the options object that carries the cost
// parameters - silently hashing at Node's defaults instead of ours.
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Roughly 100ms per hash on the target laptop. N must be a power of two, and
// scrypt needs about 128 * N * r bytes, so this asks for ~64MB.
const PARAMS = { N: 32_768, r: 8, p: 1, maxmem: 128 * 32_768 * 8 * 2 } as const;

export const PIN_LENGTH = 4;

/** Exactly four digits. Rejects "12 3", "١٢٣٤", and the empty string. */
export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);
}

/**
 * PINs a child should not be allowed to choose. These are the handful that a
 * sibling guesses first, and with only 10,000 options the top few cover a
 * meaningful slice of real-world choices.
 */
const TOO_COMMON = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1122', '1212', '2000', '2001', '1004', '2580',
]);

export function isTooCommon(pin: string): boolean {
  return TOO_COMMON.has(pin);
}

/** Stored as scrypt$N$r$p$salt$hash so parameters can change without a migration. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(pin, salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/**
 * Never throws on a malformed stored value: a corrupt row must read as "wrong
 * PIN", not as a 500 that tells an attacker the row is interesting.
 */
export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltPart, hashPart] = parts as [string, string, string, string, string, string];
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isSafeInteger(params.N) || !Number.isSafeInteger(params.r) || !Number.isSafeInteger(params.p)) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(hashPart, 'base64url');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  try {
    const derived = await scrypt(pin, Buffer.from(saltPart, 'base64url'), expected.length, {
      ...params,
      maxmem: 128 * params.N * params.r * 2,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * A hash of a value nobody knows, used to spend the same time verifying a login
 * for a user who has no PIN set as for one who does. Without it, response time
 * alone says which profiles are configured.
 */
let decoyPromise: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  decoyPromise ??= hashPin(randomBytes(8).toString('hex').slice(0, PIN_LENGTH));
  return decoyPromise;
}
