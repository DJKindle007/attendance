/**
 * Staff email -> Slack user id, cached in the staff table because
 * users.lookupByEmail is rate limited (Tier 3) and the same dozen people are
 * looked up every day.
 */
import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { lookupUserIdByEmail } from './slack';

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** Resolves every email, refreshing entries older than a week or without an id. Returns email -> id (null when unknown). */
export async function resolveSlackIds(emails: string[], opts: { refresh?: boolean } = {}): Promise<Map<string, string | null>> {
  const wanted = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const out = new Map<string, string | null>();
  if (!wanted.length) return out;
  const rows = await db().select().from(schema.staff).where(inArray(schema.staff.email, wanted));
  const byEmail = new Map(rows.map((r) => [r.email, r]));
  const now = Date.now();
  for (const email of wanted) {
    const row = byEmail.get(email);
    const fresh = row?.slackUserId && row.resolvedAt && now - row.resolvedAt.getTime() < FRESH_MS;
    if (fresh && !opts.refresh) {
      out.set(email, row!.slackUserId);
      continue;
    }
    const { id, error } = await lookupUserIdByEmail(email);
    await db()
      .insert(schema.staff)
      .values({ email, slackUserId: id, resolvedAt: new Date(), error: error ?? null })
      .onConflictDoUpdate({ target: schema.staff.email, set: { slackUserId: id ?? row?.slackUserId ?? null, resolvedAt: new Date(), error: error ?? null } });
    out.set(email, id ?? row?.slackUserId ?? null);
  }
  return out;
}

export async function slackIdFor(email: string): Promise<string | null> {
  const map = await resolveSlackIds([email]);
  return map.get(email.trim().toLowerCase()) ?? null;
}

export async function staffErrors(): Promise<{ email: string; error: string }[]> {
  const rows = await db().select().from(schema.staff).where(eq(schema.staff.slackUserId, null as unknown as string));
  return rows.filter((r) => r.error).map((r) => ({ email: r.email, error: r.error! }));
}
