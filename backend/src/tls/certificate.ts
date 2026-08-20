import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { X509Certificate } from 'node:crypto';
import acme from 'acme-client';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../env.js';

/**
 * The certificate that lets the kids' phones use the camera.
 *
 * Browsers only expose `getUserMedia` and the Push API in a secure context, and
 * a LAN address over plain http is not one. That is why photo capture has only
 * ever worked on the laptop itself. The fix is a real certificate for a real
 * hostname - but the owner's decision is that nothing goes on the internet, so
 * the name resolves to a private address on the home wifi and is unreachable
 * from anywhere else.
 *
 * That combination forces the DNS-01 challenge. The ordinary HTTP-01 challenge
 * asks the authority to fetch a file from the server over the public internet,
 * which cannot happen and must not start happening. DNS-01 proves ownership by
 * writing a TXT record instead, so the laptop never has to be reachable - only
 * the DNS is.
 */

const CERT_FILE = 'certificate.pem';
const KEY_FILE = 'private-key.pem';
const ACCOUNT_KEY_FILE = 'acme-account-key.pem';

/**
 * Renew when this much life is left. Let's Encrypt issues for 90 days and
 * recommends renewing at 30, which leaves a month of failed attempts before
 * anything actually breaks - the difference between a warning on a screen and
 * a household whose app stopped working on a Tuesday.
 */
export const RENEW_WITHIN_DAYS = 30;

export interface CertificatePaths {
  dir: string;
  cert: string;
  key: string;
}

export function certificatePaths(env: Env): CertificatePaths | null {
  if (!env.TLS_DIR) return null;
  const dir = isAbsolute(env.TLS_DIR) ? env.TLS_DIR : resolve(process.cwd(), env.TLS_DIR);
  return { dir, cert: join(dir, CERT_FILE), key: join(dir, KEY_FILE) };
}

export interface CertificateState {
  present: boolean;
  hostname: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  renewable: boolean;
}

/** What System status reports. Never throws; a missing certificate is a state. */
export async function readCertificateState(env: Env, now = new Date()): Promise<CertificateState> {
  const paths = certificatePaths(env);
  const renewable = canRenew(env);

  if (!paths) return { present: false, hostname: null, expiresAt: null, daysRemaining: null, renewable };

  try {
    const pem = await readFile(paths.cert, 'utf8');
    const parsed = new X509Certificate(pem);
    const expiresAt = new Date(parsed.validTo);
    return {
      present: true,
      hostname: parsed.subjectAltName?.replace(/^DNS:/, '') ?? null,
      expiresAt: expiresAt.toISOString(),
      daysRemaining: Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000),
      renewable,
    };
  } catch {
    return { present: false, hostname: null, expiresAt: null, daysRemaining: null, renewable };
  }
}

/** True when everything renewal needs is configured. */
export function canRenew(env: Env): boolean {
  return Boolean(
    env.PUBLIC_HOSTNAME &&
      env.TLS_DIR &&
      env.ACME_EMAIL &&
      env.CLOUDFLARE_API_TOKEN &&
      env.CLOUDFLARE_ZONE_ID,
  );
}

/* ---------- Cloudflare DNS, for the challenge record only ---------- */

interface CloudflareRecord {
  id: string;
}

async function cloudflare<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<{ success: boolean; result: T; errors?: { message: string }[] }> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as {
    success: boolean;
    result: T;
    errors?: { message: string }[];
  };
  if (!body.success) {
    const detail = body.errors?.map((entry) => entry.message).join('; ') ?? response.statusText;
    throw new Error(`Cloudflare API refused: ${detail}`);
  }
  return body;
}

async function createChallengeRecord(env: Env, name: string, value: string): Promise<string> {
  const { result } = await cloudflare<CloudflareRecord>(env, `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({ type: 'TXT', name, content: value, ttl: 60 }),
  });
  return result.id;
}

async function deleteChallengeRecord(env: Env, id: string): Promise<void> {
  await cloudflare(env, `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${id}`, { method: 'DELETE' });
}

/**
 * How long to wait after writing the TXT record before telling the authority to
 * look. Cloudflare publishes quickly, but the authority queries the
 * authoritative servers directly and a record that has not propagated is a
 * failed order plus a rate-limit charge against the account.
 */
const DNS_SETTLE_MS = 20_000;

/**
 * Obtains or renews the certificate and writes it to disk.
 *
 * Returns the paths so the caller can decide whether to restart into them.
 * Deliberately does not touch the running server: swapping a certificate under
 * a live listener is fiddly and rare, and a household restarting the app after a
 * renewal every two months is a smaller problem than a hot-swap that half works.
 */
export async function renewCertificate(
  env: Env,
  log: FastifyBaseLogger,
): Promise<CertificatePaths> {
  const paths = certificatePaths(env);
  if (!paths) throw new Error('TLS_DIR is not set, so there is nowhere to put a certificate.');
  if (!canRenew(env)) {
    throw new Error(
      'Renewal needs PUBLIC_HOSTNAME, TLS_DIR, ACME_EMAIL, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID.',
    );
  }

  await mkdir(paths.dir, { recursive: true });

  // The account key identifies this laptop to the authority across renewals.
  // Reused rather than regenerated, so the account and its rate-limit history
  // stay the same one.
  const accountKeyPath = join(paths.dir, ACCOUNT_KEY_FILE);
  let accountKey: Buffer;
  try {
    accountKey = await readFile(accountKeyPath);
  } catch {
    accountKey = await acme.crypto.createPrivateKey();
    await writeFile(accountKeyPath, accountKey, { mode: 0o600 });
  }

  const client = new acme.Client({
    directoryUrl: env.ACME_STAGING
      ? acme.directory.letsencrypt.staging
      : acme.directory.letsencrypt.production,
    accountKey,
  });

  const [key, csr] = await acme.crypto.createCsr({
    commonName: env.PUBLIC_HOSTNAME as string,
  });

  const created: string[] = [];

  const certificate = await client.auto({
    csr,
    email: env.ACME_EMAIL,
    termsOfServiceAgreed: true,
    challengePriority: ['dns-01'],

    challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
      if (challenge.type !== 'dns-01') throw new Error('Only dns-01 is usable here.');
      const name = `_acme-challenge.${env.PUBLIC_HOSTNAME}`;
      log.info({ name }, 'writing the DNS challenge record');
      created.push(await createChallengeRecord(env, name, keyAuthorization));
      await new Promise((done) => setTimeout(done, DNS_SETTLE_MS));
    },

    challengeRemoveFn: async () => {
      // Always, even when the order failed. A stale _acme-challenge record left
      // behind makes the next attempt ambiguous, and the authority will see two.
      for (const id of created.splice(0)) {
        await deleteChallengeRecord(env, id).catch((error) => {
          log.warn({ err: error }, 'could not remove the DNS challenge record');
        });
      }
    },
  });

  // Key first: a certificate on disk without its key is what a half-finished
  // renewal looks like to a server starting up, and it will not load.
  await writeFile(paths.key, key, { mode: 0o600 });
  await writeFile(paths.cert, certificate);

  log.info({ hostname: env.PUBLIC_HOSTNAME }, 'certificate renewed');
  return paths;
}

/**
 * Renews if the certificate is missing or close to expiry.
 *
 * A reconciliation like everything else on the tick: it asks how much life the
 * certificate on disk has left, not whether a timer fired, so a laptop that was
 * off for a fortnight renews when it comes back rather than having missed its
 * window.
 */
export async function renewIfDue(
  env: Env,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<boolean> {
  if (!canRenew(env)) return false;

  const state = await readCertificateState(env, now);
  if (state.present && (state.daysRemaining ?? 0) > RENEW_WITHIN_DAYS) return false;

  await renewCertificate(env, log);
  return true;
}

/** Reads the certificate and key for the https listener, or null. */
export async function loadCertificate(env: Env): Promise<{ cert: string; key: string } | null> {
  const paths = certificatePaths(env);
  if (!paths) return null;
  try {
    await stat(paths.cert);
    return {
      cert: await readFile(paths.cert, 'utf8'),
      key: await readFile(paths.key, 'utf8'),
    };
  } catch {
    return null;
  }
}
