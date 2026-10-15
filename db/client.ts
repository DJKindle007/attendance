import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Production: Neon over HTTP, one fetch per statement, nothing to keep open,
 * which suits Vercel functions. Interactive transactions are not available on
 * that driver; the app never needs them (see docs/DECISIONS.md).
 *
 * Local: any plain Postgres (DB_DRIVER=pg, or a localhost DATABASE_URL) through
 * node-postgres, so `npm run dev` works against a database on this machine.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  return url;
}

function shouldUseNodePg(url: string): boolean {
  const driver = (process.env.DB_DRIVER || '').toLowerCase();
  if (driver === 'pg') return true;
  if (driver === 'neon') return false;
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

let cached: Db | null = null;

export function db(): Db {
  if (!cached) {
    const url = connectionString();
    cached = shouldUseNodePg(url) ? (drizzlePg(new Pool({ connectionString: url, max: 4 }), { schema }) as unknown as Db) : (drizzleNeon(neon(url), { schema }) as unknown as Db);
  }
  return cached;
}

export { schema };
