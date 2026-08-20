import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const csv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * An empty variable in a .env file is the same as an absent one. Without this,
 * `VAPID_SUBJECT=` would read as a set-but-blank value and push would think it
 * was configured.
 */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('127.0.0.1'),
  HOUSEHOLD_TZ: z.string().default('America/Chicago'),
  CORS_ORIGINS: z.string().default('http://localhost:5173').transform(csv),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  // Web Push. All three or none: two out of three is not a configuration
  // anybody chose, and it would leave push half-on with no way to say which
  // half is missing. Generate a pair with `npm run vapid -w backend`.
  VAPID_PUBLIC_KEY: optionalText,
  VAPID_PRIVATE_KEY: optionalText,
  VAPID_SUBJECT: optionalText,
  PHOTO_STORAGE_DIR: z.string().default('./storage/photos'),
  BACKUP_DIR: z.string().default('./storage/backups'),
  // The removable drive. A backup on the same disk as the database survives a
  // mistake and a corrupt table; it does not survive that disk dying, or the
  // laptop being lost. Owner decision: mirror to a USB drive when it is plugged
  // in. Absent or not-currently-a-directory means "not plugged in", which is
  // the ordinary case and never an error - System status says when it last
  // happened so nobody has to assume.
  BACKUP_MIRROR_DIR: optionalText,
  // Where pg_dump and pg_restore live. Usually found without help; needed when
  // the app runs under an account whose PATH does not include PostgreSQL -
  // which on this laptop is every account except the one that installed it.
  PG_BIN_DIR: optionalText,

  // Serving the household over https on the home wifi.
  //
  // Owner decision: nothing is exposed to the internet. The name below resolves
  // to this laptop's address on the LAN, so only devices on the wifi can reach
  // it - but the certificate is issued by a public authority, so the kids'
  // phones trust it with nothing installed on them. That is what the camera and
  // notifications need, and what plain http on a LAN address can never be.
  PUBLIC_HOSTNAME: optionalText,
  // Where the certificate and its key live. Written by the renewal, or put
  // there by hand. Absent means plain http on PORT, exactly as before.
  TLS_DIR: optionalText,
  HTTPS_PORT: z.coerce.number().int().positive().default(443),
  // The built frontend, served from the same origin as the API so the session
  // cookie is first-party. Safari on iOS blocks third-party cookies outright,
  // and the kids are the ones on phones.
  FRONTEND_DIST: optionalText,

  // Automatic renewal. A certificate lasts 90 days, so this cannot be a thing
  // somebody remembers. DNS-01 because the usual challenge needs the laptop
  // reachable from the internet, which is the one thing being avoided.
  ACME_EMAIL: optionalText,
  CLOUDFLARE_API_TOKEN: optionalText,
  CLOUDFLARE_ZONE_ID: optionalText,
  // Let's Encrypt staging, for testing renewal without burning rate limits.
  ACME_STAGING: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});

const EnvSchemaChecked = EnvSchema.superRefine((value, ctx) => {
  const vapid = [value.VAPID_PUBLIC_KEY, value.VAPID_PRIVATE_KEY, value.VAPID_SUBJECT];
  const set = vapid.filter(Boolean).length;
  if (set !== 0 && set !== 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['VAPID_PUBLIC_KEY'],
      message:
        'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT together, or leave all three ' +
        'empty to run without push. Generate a pair with: npm run vapid -w backend',
    });
    return;
  }
  const subject = value.VAPID_SUBJECT;
  if (subject && !/^(mailto:|https:\/\/)/.test(subject)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['VAPID_SUBJECT'],
      // Push services reject anything else outright, and they do it at send
      // time - which would be the evening the first reminder failed to arrive.
      message: 'VAPID_SUBJECT must be a mailto: address or an https:// URL.',
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

function assertTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new Error(`HOUSEHOLD_TZ is not a valid IANA timezone: ${tz}`);
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchemaChecked.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  assertTimezone(parsed.data.HOUSEHOLD_TZ);
  return parsed.data;
}

export const env = loadEnv();
