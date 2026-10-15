import { NextResponse } from 'next/server';

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** A 503 for API routes when there is no database yet (preview deploys), or null when all is well. */
export function dbNotConfiguredResponse(): NextResponse | null {
  if (isDbConfigured()) return null;
  return NextResponse.json({ error: 'database not configured: set DATABASE_URL' }, { status: 503 });
}
