/**
 * Creates a household member and sets their PIN, from the laptop's terminal.
 *
 * This exists because authentication has a bootstrap problem: the parent screens
 * that manage people (Stage 10) sit behind a login, and there is nobody to log
 * in as until someone is created. Seeding a family into a migration was the
 * alternative and would have hardcoded real names into version control.
 *
 *   npm run user -w backend -- --role parent --name "Alex"
 *   npm run user -w backend -- --role child  --name "Sam" --sort 1
 *   npm run user -w backend -- --pin --name "Sam"          # change a PIN
 *   npm run user -w backend -- --list
 *
 * The PIN is asked for on stdin rather than taken as a flag, so it stays out of
 * shell history. It is not masked - this runs on the household's own laptop.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import '../pg-parsers.js';
import { getPool, closePool } from '../db.js';
import { hashPin, isTooCommon, isValidPinFormat, PIN_LENGTH } from '../auth/pin.js';
import { revokeAllForUser } from '../auth/sessions.js';

interface Args {
  role?: 'parent' | 'child';
  name?: string;
  sort?: number;
  list?: boolean;
  pinOnly?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--role' && (value === 'parent' || value === 'child')) {
      args.role = value;
      i += 1;
    } else if (flag === '--name' && value) {
      args.name = value;
      i += 1;
    } else if (flag === '--sort' && value) {
      args.sort = Number(value);
      i += 1;
    } else if (flag === '--list') {
      args.list = true;
    } else if (flag === '--pin') {
      args.pinOnly = true;
    }
  }
  return args;
}

function usage(): void {
  console.log(`
Manage household members.

  --list                       show everyone
  --role parent|child --name N create a member and set their PIN
  --pin --name N               change an existing member's PIN
  --sort N                     display order (children, optional)
`);
}

/**
 * Reads lines from stdin whether it is a terminal or a pipe.
 *
 * readline/promises' question() throws ERR_USE_AFTER_CLOSE once piped input
 * reaches EOF, so the obvious implementation works when a person runs this and
 * fails the moment anyone scripts it.
 */
function createAsker() {
  const rl = createInterface({ input: stdin });
  const iterator = rl[Symbol.asyncIterator]();

  return {
    async ask(prompt: string): Promise<string | null> {
      stdout.write(prompt);
      const next = await iterator.next();
      if (next.done) {
        stdout.write('\n');
        return null;
      }
      return next.value.trim();
    },
    close: () => rl.close(),
  };
}

async function askPin(asker: ReturnType<typeof createAsker>): Promise<string | null> {
  for (;;) {
    const pin = await asker.ask(`Choose a ${PIN_LENGTH}-digit PIN: `);
    if (pin === null) return null;

    if (!isValidPinFormat(pin)) {
      console.log(`  That needs to be exactly ${PIN_LENGTH} digits.`);
      continue;
    }
    if (isTooCommon(pin)) {
      console.log('  That is one of the first PINs anyone guesses. Pick another.');
      continue;
    }

    const again = await asker.ask('Type it again: ');
    if (again === null) return null;
    if (again !== pin) {
      console.log('  Those did not match.');
      continue;
    }
    return pin;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();

  if (!pool) {
    console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
    process.exitCode = 1;
    return;
  }

  if (args.list) {
    const { rows } = await pool.query(
      `SELECT role, display_name, sort_order, (pin_hash IS NOT NULL) AS has_pin,
              is_active, last_login_at
         FROM users ORDER BY role DESC, sort_order, display_name`,
    );
    if (rows.length === 0) {
      console.log('No household members yet. Create one with --role parent --name "..."');
      return;
    }
    console.table(
      rows.map((r) => ({
        role: r.role,
        name: r.display_name,
        order: r.sort_order,
        pin: r.has_pin ? 'set' : 'NOT SET',
        active: r.is_active,
        lastLogin: r.last_login_at ? new Date(r.last_login_at).toLocaleString() : 'never',
      })),
    );
    return;
  }

  if (!args.name || (!args.role && !args.pinOnly)) {
    usage();
    process.exitCode = 1;
    return;
  }

  const asker = createAsker();
  try {
    const existing = await pool.query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM users WHERE display_name = $1',
      [args.name],
    );
    const found = existing.rows[0];

    if (args.pinOnly && !found) {
      console.error(`No member named "${args.name}".`);
      process.exitCode = 1;
      return;
    }
    if (!args.pinOnly && found) {
      console.error(`"${args.name}" already exists. Use --pin --name "${args.name}" to change their PIN.`);
      process.exitCode = 1;
      return;
    }

    const pin = await askPin(asker);
    if (pin === null) {
      console.error('No PIN entered; nothing was changed.');
      process.exitCode = 1;
      return;
    }
    const pinHash = await hashPin(pin);

    if (found) {
      await pool.query(
        `UPDATE users SET pin_hash = $2, pin_set_at = now(),
                          failed_pin_attempts = 0, pin_locked_until = NULL
          WHERE id = $1`,
        [found.id, pinHash],
      );
      // A changed PIN has to end sessions that were opened with the old one,
      // otherwise changing it after a device is lost achieves nothing.
      const revoked = await revokeAllForUser(pool, found.id);
      console.log(`\nUpdated the PIN for ${found.display_name}.`);
      if (revoked > 0) {
        console.log(`Signed out ${revoked} device${revoked === 1 ? '' : 's'} that used the old PIN.`);
      }
    } else {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (role, display_name, pin_hash, pin_set_at, sort_order)
         VALUES ($1, $2, $3, now(), $4) RETURNING id`,
        [args.role, args.name, pinHash, args.sort ?? 0],
      );
      console.log(`\nCreated ${args.role} "${args.name}" (${rows[0]?.id}).`);
    }
  } finally {
    asker.close();
    await closePool();
  }
}

await main();
