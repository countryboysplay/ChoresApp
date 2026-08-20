import { networkInterfaces } from 'node:os';
import { loadEnv } from '../env.js';
import { canRenew, readCertificateState, renewCertificate } from '../tls/certificate.js';

/**
 * Getting the first certificate, and checking on it afterwards.
 *
 * Renewal happens by itself once this has run once - the server checks every
 * tick and renews inside thirty days of expiry. This exists for the first one,
 * and for the moments when somebody wants to know what is actually on disk
 * rather than what a screen says about it.
 *
 *   npm run cert -- --status
 *   npm run cert -- --issue
 */

const log = {
  info: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
} as never;

/** The laptop's address on the house wifi - what the DNS record must point at. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => (entry as { address: string }).address);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const args = process.argv.slice(2);
  const wantsIssue = args.includes('--issue');

  const state = await readCertificateState(env);

  console.log(`
Hostname   ${env.PUBLIC_HOSTNAME ?? 'not set (PUBLIC_HOSTNAME)'}
Folder     ${env.TLS_DIR ?? 'not set (TLS_DIR)'}
Renewal    ${canRenew(env) ? 'configured' : 'not configured'}
`);

  if (state.present) {
    console.log(`Certificate for ${state.hostname ?? 'unknown'}`);
    console.log(`  expires ${state.expiresAt} (${state.daysRemaining} days)`);
  } else {
    console.log('No certificate on disk yet.');
  }

  const addresses = lanAddresses();
  if (addresses.length > 0) {
    console.log(`
This laptop on the house wifi: ${addresses.join(', ')}
The DNS A record for ${env.PUBLIC_HOSTNAME ?? 'your hostname'} must point at that
address. It is a private address, so the name works on your wifi and nowhere
else - which is the point.`);
  }

  if (!wantsIssue) {
    console.log('\nRun with --issue to obtain or renew now.\n');
    return;
  }

  if (!canRenew(env)) {
    console.error(`
Cannot issue yet. backend/.env needs all of:
  PUBLIC_HOSTNAME        the name the phones will use
  TLS_DIR                where to keep the certificate
  ACME_EMAIL             where expiry warnings go
  CLOUDFLARE_API_TOKEN   a token with Zone:DNS:Edit on that zone only
  CLOUDFLARE_ZONE_ID     the zone the hostname belongs to
`);
    process.exitCode = 1;
    return;
  }

  console.log(`
Asking Let's Encrypt${env.ACME_STAGING ? ' (staging)' : ''} for a certificate.
This writes a DNS record, waits for it to publish, and removes it afterwards.
It takes about a minute.
`);

  try {
    const paths = await renewCertificate(env, log);
    console.log(`
Done. Written to:
  ${paths.cert}
  ${paths.key}

Restart the server to serve it. The certificate is only read at startup, so
until then the app is still on plain http.
`);
  } catch (error) {
    console.error('\nThat did not work:', error instanceof Error ? error.message : error);
    console.error(`
Most first attempts fail on one of these:
  - the API token lacks Zone:DNS:Edit, or is for the wrong zone
  - CLOUDFLARE_ZONE_ID belongs to a different domain than PUBLIC_HOSTNAME
  - the domain's nameservers are not Cloudflare's yet, which can take a while

Use ACME_STAGING=true while sorting it out. Let's Encrypt limits how many
certificates a domain can be issued per week, and staging does not count.
`);
    process.exitCode = 1;
  }
}

void main();
