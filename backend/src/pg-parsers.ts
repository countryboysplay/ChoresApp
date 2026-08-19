import pg from 'pg';

/**
 * How this schema's Postgres types map into JavaScript.
 *
 * node-postgres keeps these parsers in module-level global state, so this file
 * must be imported by anything that talks to Postgres directly - including
 * tests. It lives on its own rather than inside db.ts precisely because a test
 * that opened its own Pool got raw defaults back and silently disagreed with
 * the running app about what a date is.
 *
 * Import for the side effect:  import './pg-parsers.js';
 */

// int8 and numeric arrive as strings so that large values cannot silently lose
// precision. Points, cents, and counts in this schema are small integers that
// fit a JS number exactly, and returning strings would push Number() calls into
// every caller instead.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

// A `date` column here is a household day, not an instant. The default parser
// builds a JS Date at the server's local midnight, which is one timezone slip
// away from reporting the wrong chore day - the exact bug DECISIONS.md set out
// to avoid by computing days with Intl. Keep the YYYY-MM-DD string as-is.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export {};
