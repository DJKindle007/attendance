/**
 * Server-only DeansList API client, trimmed from deanslist-dashboard.
 *
 * Base URL: https://{DEANSLIST_SUBDOMAIN}.deanslistsoftware.com/api
 * Auth:     ?apikey=... on every request (DeansList's scheme)
 *
 * Verified against Kindle's account by the dashboard: v1/daily-attendance
 * filters on sdt/edt and returns today only when they are omitted. This app
 * always sends both and still filters by BehaviorDate, so a change in that
 * default cannot leak another day's marks into a job.
 */
import { DLAttendanceCode, DLAttendanceRow, DLRoster, DLStudent, str } from './types';

export interface DeansListConfig {
  subdomain: string;
  apiKey: string;
  baseUrl: string;
}

export function getDeansListConfig(): DeansListConfig | null {
  const subdomain = (process.env.DEANSLIST_SUBDOMAIN || '').trim();
  const apiKey = (process.env.DEANSLIST_API_KEY || '').trim();
  const override = (process.env.DEANSLIST_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!apiKey || (!subdomain && !override)) return null;
  const baseUrl = override || `https://${subdomain}.deanslistsoftware.com/api`;
  return { subdomain, apiKey, baseUrl };
}

export function requireDeansListConfig(): DeansListConfig {
  const config = getDeansListConfig();
  if (!config) throw new DeansListError('DeansList is not configured. Set DEANSLIST_SUBDOMAIN and DEANSLIST_API_KEY.', 0, '');
  return config;
}

export class DeansListError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = 'DeansListError';
  }
}

// Jobs run inside Vercel's 60 s limit, so a single call may not eat most of it.
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 5000;

interface ApiEnvelope<T> {
  data?: T[] | T;
  rowcount?: number;
  total_pages?: number;
}

async function apiGet<T>(config: DeansListConfig, path: string, params: Record<string, string | number>): Promise<ApiEnvelope<T>> {
  const url = new URL(`${config.baseUrl}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('apikey', config.apiKey);

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DeansListError(`Could not reach DeansList (${path}): ${reason}`, 0, path);
  }

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? ' Check DEANSLIST_API_KEY and DEANSLIST_SUBDOMAIN.'
        : response.status === 400
          ? ' DeansList rejected the request parameters.'
          : response.status === 404
            ? ' The endpoint may not be enabled for this school; ask DeansList support.'
            : '';
    const body = (await response.text().catch(() => ''))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    throw new DeansListError(`DeansList returned HTTP ${response.status} for ${path}.${hint}${body ? ` Response: ${body}` : ''}`, response.status, path);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new DeansListError(`DeansList returned non-JSON for ${path} (${text.slice(0, 80)}...)`, response.status, path);
  }
}

function rows<T>(envelope: ApiEnvelope<T>): T[] {
  const data = envelope.data;
  return Array.isArray(data) ? data : data ? [data] : [];
}

async function apiGetAll<T>(config: DeansListConfig, path: string, params: Record<string, string | number>): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const envelope = await apiGet<T>(config, path, { ...params, page, page_size: PAGE_SIZE });
    all.push(...rows(envelope));
    totalPages = Number(envelope.total_pages) || 1;
    page++;
  } while (page <= totalPages);
  return all;
}

/** Every student, including those who left (so a withdrawal flips enrolled=false in the cache instead of vanishing). */
export function fetchStudents(config: DeansListConfig): Promise<DLStudent[]> {
  return apiGetAll<DLStudent>(config, 'v1/students', { IncludeUnenrolled: 'Y' });
}

export async function fetchRosters(config: DeansListConfig): Promise<DLRoster[]> {
  return rows(await apiGet<DLRoster>(config, 'v1/rosters', {}));
}

/** Daily attendance marks for one calendar day (YYYY-MM-DD), filtered again by BehaviorDate for safety. */
export async function fetchAttendanceForDay(config: DeansListConfig, dateKey: string): Promise<DLAttendanceRow[]> {
  const all = rows(await apiGet<DLAttendanceRow>(config, 'v1/daily-attendance', { sdt: dateKey, edt: dateKey }));
  const seen = new Set<string>();
  const out: DLAttendanceRow[] = [];
  for (const r of all) {
    if (!str(r.BehaviorDate).startsWith(dateKey)) continue;
    const id = str(r.DLSAID);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(r);
  }
  return out;
}

export async function fetchAttendanceCodes(config: DeansListConfig): Promise<DLAttendanceCode[]> {
  return rows(await apiGet<DLAttendanceCode>(config, 'v1/daily-attendance/codes', {}));
}
