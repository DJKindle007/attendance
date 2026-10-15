/** Kiosk device cookie: a random token whose SHA-256 is stored in kiosk_devices. */
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db, schema } from '@/db/client';

export const KIOSK_COOKIE = 'kiosk_token';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function deviceForToken(token: string | undefined | null) {
  if (!token) return null;
  const rows = await db()
    .select()
    .from(schema.kioskDevices)
    .where(and(eq(schema.kioskDevices.tokenHash, hashToken(token)), isNull(schema.kioskDevices.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** The paired device for the current request, or null. Touches last_seen_at at most once a minute. */
export async function currentKioskDevice() {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  const device = await deviceForToken(token);
  if (device && (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60_000)) {
    await db().update(schema.kioskDevices).set({ lastSeenAt: new Date() }).where(eq(schema.kioskDevices.id, device.id));
  }
  return device;
}

export function kioskCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: COOKIE_MAX_AGE };
}
