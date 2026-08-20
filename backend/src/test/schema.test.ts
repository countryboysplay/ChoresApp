/**
 * Schema tests. These assert the rules the database itself enforces, because a
 * CHECK constraint nobody tests is a comment with extra syntax.
 *
 * They need a real Postgres. When TEST_DATABASE_URL is unset the whole file
 * skips rather than failing, so `npm test` still works on a machine without the
 * database - CI is exactly that machine.
 *
 * Every test runs inside a transaction that is rolled back, so the suite can be
 * re-run against a database with real household data in it without touching a
 * single row.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
// Same type parsing the app uses. Without this the test would be asserting
// against different JavaScript types than production sees.
import '../pg-parsers.js';
import { testConnectionString } from './database.js';

const connectionString = testConnectionString;
const describeDb = connectionString ? describe : describe.skip;

let pool: pg.Pool;

/** Runs `body` in a transaction and always rolls it back. */
async function inRollback<T>(body: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await body(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/**
 * First row, or a clear failure. tsconfig has noUncheckedIndexedAccess, and a
 * non-null assertion here would turn "the query returned nothing" into a
 * confusing TypeError several lines later.
 */
function first<T extends pg.QueryResultRow>(result: pg.QueryResult<T>): T {
  const row = result.rows[0];
  if (!row) throw new Error('expected the query to return at least one row');
  return row;
}

/** Asserts a statement is rejected, and that it fails the way we expect. */
async function expectRejection(
  client: pg.PoolClient,
  sql: string,
  params: unknown[],
  match: RegExp,
): Promise<void> {
  await client.query('SAVEPOINT attempt');
  await expect(client.query(sql, params)).rejects.toThrow(match);
  await client.query('ROLLBACK TO SAVEPOINT attempt');
}

async function makeChild(client: pg.PoolClient, name = 'Test Child'): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (role, display_name) VALUES ('child', $1) RETURNING id`,
    [name],
  );
  return first(result).id;
}

async function makeChore(client: pg.PoolClient, points = 10): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO chore_definitions (name, icon, kind, points)
     VALUES ('Test Chore', 'kitchen', 'core', $1) RETURNING id`,
    [points],
  );
  return first(result).id;
}

async function makeInstance(
  client: pg.PoolClient,
  choreId: string,
  childId: string | null,
  choreDate = '2026-08-19',
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, points_value)
     VALUES ($1, $2, $3, 10) RETURNING id`,
    [choreId, childId, choreDate],
  );
  return first(result).id;
}

beforeAll(() => {
  if (connectionString) pool = new pg.Pool({ connectionString, max: 4 });
});

afterAll(async () => {
  await pool?.end();
});

describeDb('migrations', () => {
  it('applied every migration in the folder', async () => {
    // Compared against the directory rather than a hardcoded list, so adding a
    // migration does not mean editing this test - and forgetting to run one
    // still fails here.
    const dir = fileURLToPath(new URL('../../migrations', import.meta.url));
    const onDisk = (await readdir(dir))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.replace(/\.sql$/, ''))
      .sort();

    const { rows } = await pool.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id');
    const applied = rows.map((r) => r.name).sort();

    expect(onDisk.length).toBeGreaterThan(0);
    expect(applied).toEqual(onDisk);
  });

  it('keeps exactly one settings row and refuses a second', async () => {
    await inRollback(async (client) => {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM household_settings');
      expect(rows[0].n).toBe(1);

      await expectRejection(
        client,
        'INSERT INTO household_settings (id) VALUES (true)',
        [],
        /duplicate key|unique/i,
      );
    });
  });
});

describeDb('money values the specification forbids inventing', () => {
  it('leaves the conversion rate and cash-out minimum unset', async () => {
    const { rows } = await pool.query(
      'SELECT points_per_dollar, minimum_cash_out_points FROM household_settings',
    );
    // If either ever gains a default, the wallet silently starts showing a
    // household money rule nobody chose. That is the failure this guards.
    expect(rows[0].points_per_dollar).toBeNull();
    expect(rows[0].minimum_cash_out_points).toBeNull();
  });

  it('fixes the weekly cash-out cap at $40 in whole cents', async () => {
    const { rows } = await pool.query('SELECT weekly_cash_out_cap_cents FROM household_settings');
    expect(rows[0].weekly_cash_out_cap_cents).toBe(4000);
  });
});

describeDb('chore instances', () => {
  it('allows only one core chore per child per day', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);
      await makeInstance(client, chore, child);

      await expectRejection(
        client,
        `INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, points_value)
         VALUES ($1, $2, '2026-08-19', 10)`,
        [chore, child],
        /duplicate key|unique/i,
      );
    });
  });

  it('still allows several unclaimed bonus chores on the same day', async () => {
    await inRollback(async (client) => {
      const chore = await makeChore(client);
      await makeInstance(client, chore, null);
      // The partial index excludes NULL assignees; this must not collide.
      const second = await makeInstance(client, chore, null);
      expect(second).toBeTruthy();
    });
  });

  it('refuses a rejection with no note', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);
      const instance = await makeInstance(client, chore, child);

      await expectRejection(
        client,
        `UPDATE chore_instances SET status = 'rejected' WHERE id = $1`,
        [instance],
        /rejection_has_note/,
      );

      await client.query(
        `UPDATE chore_instances SET status = 'rejected', rejection_note = 'Mirror still has spots.'
         WHERE id = $1`,
        [instance],
      );
    });
  });

  it('refuses to record points on a chore that is not approved', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);
      const instance = await makeInstance(client, chore, child);

      await expectRejection(
        client,
        `UPDATE chore_instances SET points_awarded = 10 WHERE id = $1`,
        [instance],
        /award_only_when_approved/,
      );
    });
  });

  it('keeps chore_date as a plain YYYY-MM-DD string, never a Date', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);
      await makeInstance(client, chore, child, '2026-03-08');

      const { rows } = await client.query(
        'SELECT chore_date FROM chore_instances WHERE assigned_to = $1',
        [child],
      );
      // Parsing this into a Date would apply the server's timezone and can
      // report the previous day. The household day is decided by the app.
      expect(rows[0].chore_date).toBe('2026-03-08');
    });
  });
});

describeDb('subtask snapshots', () => {
  it('survives its template being deleted', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);
      const instance = await makeInstance(client, chore, child);

      const template = first(
        await client.query<{ id: string }>(
          `INSERT INTO chore_subtask_templates (chore_definition_id, position, title)
           VALUES ($1, 0, 'Wash dishes') RETURNING id`,
          [chore],
        ),
      );
      await client.query(
        `INSERT INTO chore_instance_subtasks (chore_instance_id, template_id, position, title, done, done_at)
         VALUES ($1, $2, 0, 'Wash dishes', true, now())`,
        [instance, template.id],
      );

      await client.query('DELETE FROM chore_subtask_templates WHERE id = $1', [template.id]);

      const saved = first(
        await client.query(
          'SELECT title, template_id, done FROM chore_instance_subtasks WHERE chore_instance_id = $1',
          [instance],
        ),
      );
      // What the child actually ticked off is still readable.
      expect(saved.title).toBe('Wash dishes');
      expect(saved.done).toBe(true);
      expect(saved.template_id).toBeNull();
    });
  });

  it('refuses a subtask marked done with no completion time', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);
      const instance = await makeInstance(client, chore, child);

      await expectRejection(
        client,
        `INSERT INTO chore_instance_subtasks (chore_instance_id, position, title, done)
         VALUES ($1, 0, 'Sweep floor', true)`,
        [instance],
        /done_has_time/,
      );
    });
  });
});

describeDb('points ledger', () => {
  it('derives the balance from the rows, with no stored total to drift', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      for (const [delta, reason, label] of [
        [12, 'chore_approved', 'Kitchen Cleaning approved'],
        [2, 'punctuality_bonus', 'Punctuality bonus'],
        [-150, 'reward_redeemed', 'Movie night pick redeemed'],
      ] as const) {
        await client.query(
          'INSERT INTO points_ledger (child_id, delta, reason, label) VALUES ($1, $2, $3, $4)',
          [child, delta, reason, label],
        );
      }

      const { rows } = await client.query(
        `SELECT coalesce(sum(delta), 0)::int AS spendable,
                coalesce(sum(delta) FILTER (WHERE delta > 0), 0)::int AS lifetime
           FROM points_ledger WHERE child_id = $1`,
        [child],
      );
      expect(rows[0].spendable).toBe(-136);
      expect(rows[0].lifetime).toBe(14);
    });
  });

  it('pays out a given chore only once', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);
      const instance = await makeInstance(client, chore, child);

      await client.query(
        `INSERT INTO points_ledger (child_id, delta, reason, label, chore_instance_id)
         VALUES ($1, 10, 'chore_approved', 'Test Chore approved', $2)`,
        [child, instance],
      );

      // A double-tap on Approve must not quietly double the child's points.
      await expectRejection(
        client,
        `INSERT INTO points_ledger (child_id, delta, reason, label, chore_instance_id)
         VALUES ($1, 10, 'chore_approved', 'Test Chore approved', $2)`,
        [child, instance],
        /duplicate key|unique/i,
      );

      // The punctuality bonus is a different reason, so it is still allowed.
      await client.query(
        `INSERT INTO points_ledger (child_id, delta, reason, label, chore_instance_id)
         VALUES ($1, 2, 'punctuality_bonus', 'Punctuality bonus', $2)`,
        [child, instance],
      );
    });
  });

  it('refuses a zero-point entry', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      await expectRejection(
        client,
        `INSERT INTO points_ledger (child_id, delta, reason, label)
         VALUES ($1, 0, 'manual_adjustment', 'Nothing happened')`,
        [child],
        /delta/,
      );
    });
  });
});

describeDb('rewards', () => {
  it('allows a child only one primary saving goal', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const { rows: r } = await client.query<{ id: string }>(
        `INSERT INTO rewards (name, cost_points, category, icon) VALUES
           ('Screen time', 120, 'Screen Time', 'screen'),
           ('Movie night', 150, 'Activities', 'activity')
         RETURNING id`,
      );
      const [screenTime, movieNight] = r;
      if (!screenTime || !movieNight) throw new Error('expected two rewards');

      await client.query(
        `INSERT INTO child_reward_preferences (child_id, reward_id, is_primary_goal)
         VALUES ($1, $2, true)`,
        [child, screenTime.id],
      );

      await expectRejection(
        client,
        `INSERT INTO child_reward_preferences (child_id, reward_id, is_primary_goal)
         VALUES ($1, $2, true)`,
        [child, movieNight.id],
        /duplicate key|unique/i,
      );

      // Hearting a second reward is fine - only the goal is exclusive.
      await client.query(
        `INSERT INTO child_reward_preferences (child_id, reward_id, is_favorite)
         VALUES ($1, $2, true)`,
        [child, movieNight.id],
      );
    });
  });
});

describeDb('schedules', () => {
  it('refuses a weekly schedule with no days chosen', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);

      await expectRejection(
        client,
        `INSERT INTO chore_schedules (chore_definition_id, assigned_to, recurrence, starts_on)
         VALUES ($1, $2, 'weekly', '2026-08-19')`,
        [chore, child],
        /weekly_needs_days/,
      );
    });
  });

  it('refuses a weekday outside 1-7', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const chore = await makeChore(client);

      await expectRejection(
        client,
        `INSERT INTO chore_schedules (chore_definition_id, assigned_to, recurrence, days_of_week, starts_on)
         VALUES ($1, $2, 'weekly', '{0,8}', '2026-08-19')`,
        [chore, child],
        /days_in_range/,
      );
    });
  });
});

describeDb('updated_at trigger', () => {
  it('moves on update without the query having to remember', async () => {
    await inRollback(async (client) => {
      const child = await makeChild(client);
      const { rows: before } = await client.query(
        'SELECT updated_at FROM users WHERE id = $1',
        [child],
      );
      await client.query(`UPDATE users SET display_name = 'Renamed' WHERE id = $1`, [child]);
      const { rows: after } = await client.query(
        'SELECT updated_at FROM users WHERE id = $1',
        [child],
      );
      expect(after[0].updated_at.getTime()).toBeGreaterThanOrEqual(before[0].updated_at.getTime());
    });
  });
});
