import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const csv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('127.0.0.1'),
  HOUSEHOLD_TZ: z.string().default('America/Chicago'),
  CORS_ORIGINS: z.string().default('http://localhost:5173').transform(csv),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  PHOTO_STORAGE_DIR: z.string().default('./storage/photos'),
  BACKUP_DIR: z.string().default('./storage/backups'),
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
  const parsed = EnvSchema.safeParse(source);

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
