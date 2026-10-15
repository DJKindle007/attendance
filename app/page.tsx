import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { currentAdminEmail, signOut } from '@/auth';
import { AdminCheckin, GuardianUpload, PairKioskButton, RevokeKioskButton, RunJobButton, UndoButton } from '@/components/AdminActions';
import { db, schema } from '@/db/client';
import { env, isDryRun, schoolConfig } from '@/lib/config';
import { JOBS } from '@/lib/jobs';
import { formatLongDate, formatTime, isSchoolDay, todayKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const today = todayKey();
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const cfg = schoolConfig();
  const email = await currentAdminEmail();

  const [homerooms, checkinRows, notices, runs, devices, staffRows, rosterCount, noGuardian] = await Promise.all([
    db().select().from(schema.homeroomStatus).where(eq(schema.homeroomStatus.runDate, date)).orderBy(schema.homeroomStatus.homeroom),
    db()
      .select({ c: schema.checkins, s: schema.studentsCache })
      .from(schema.checkins)
      .leftJoin(schema.studentsCache, eq(schema.checkins.dlStudentId, schema.studentsCache.dlStudentId))
      .where(eq(schema.checkins.runDate, date))
      .orderBy(desc(schema.checkins.checkedInAt)),
    db()
      .select({ n: schema.parentNotices, s: schema.studentsCache })
      .from(schema.parentNotices)
      .leftJoin(schema.studentsCache, eq(schema.parentNotices.dlStudentId, schema.studentsCache.dlStudentId))
      .where(eq(schema.parentNotices.runDate, date))
      .orderBy(desc(schema.parentNotices.createdAt)),
    db().select().from(schema.jobRuns).orderBy(desc(schema.jobRuns.startedAt)).limit(25),
    db().select().from(schema.kioskDevices).where(isNull(schema.kioskDevices.revokedAt)).orderBy(desc(schema.kioskDevices.createdAt)),
    db().select().from(schema.staff).where(isNull(schema.staff.slackUserId)),
    db().select({ n: sql<number>`count(*)::int` }).from(schema.studentsCache).where(eq(schema.studentsCache.enrolled, true)),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.studentsCache)
      .where(and(eq(schema.studentsCache.enrolled, true), sql`jsonb_array_length(${schema.studentsCache.guardianEmails}) = 0`)),
  ]);

  const configured = Object.keys(cfg.homerooms).sort();
  const statusByHomeroom = new Map(homerooms.map((h) => [h.homeroom, h]));
  const activeCheckins = checkinRows.filter((r) => !r.c.undoneAt);
  const dryRun = isDryRun();
  const name = (s: typeof schema.studentsCache.$inferSelect | null, id: string) => (s ? `${s.preferredName || s.firstName} ${s.lastName}` : id);

  return (
    <main className="min-h-screen p-6 sm:p-10 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <img src="https://images.squarespace-cdn.com/content/v1/632fd47c6695d574095f511f/947a9b64-46c2-4575-b420-0c4feb5b2459/LogoOrange.png" alt="" width={36} height={36} />
          <div>
            <h1 className="text-xl font-bold leading-tight">Attendance</h1>
            <div className="text-sm text-muted">{cfg.schoolName}</div>
          </div>
        </div>
        <div className="text-sm text-muted flex items-center gap-3">
          {dryRun && <span className="chip chip-warn">DRY RUN: nothing is sent</span>}
          {email && <span>{email}</span>}
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/signin' });
            }}
          >
            <button className="underline" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mb-6 flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2" method="get">
          <label className="label" htmlFor="date">
            Day
          </label>
          <input id="date" type="date" name="date" defaultValue={date} className="px-2 py-1 rounded-md border border-line text-sm" />
          <button className="btn" type="submit">
            Show
          </button>
        </form>
        <span className="text-sm text-muted">
          {formatLongDate(date)} {isSchoolDay(date) ? '' : '(not a school day)'}
        </span>
        <a className="btn" href={`/api/admin/reports/tardy?date=${date}`}>
          Download tardy spreadsheet
        </a>
      </section>

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Tile label="Enrolled students" value={rosterCount[0]?.n ?? 0} hint="from the last roster refresh" />
        <Tile label="Late check-ins" value={activeCheckins.length} hint={`on ${date}`} />
        <Tile label="Homerooms missing" value={configured.filter((h) => statusByHomeroom.get(h) && !statusByHomeroom.get(h)!.submittedSeenAt && (statusByHomeroom.get(h)!.enrolled ?? 0) > 0).length} hint={`of ${configured.length} configured`} />
        <Tile label="Family emails sent" value={notices.filter((n) => n.n.status === 'sent').length} hint={`${notices.filter((n) => n.n.kind === 'reversal').length} arrival follow-ups`} />
        <Tile label="No guardian email" value={noGuardian[0]?.n ?? 0} hint="enrolled students; upload a CSV below" tone={(noGuardian[0]?.n ?? 0) > 0 ? 'warn' : undefined} />
      </div>

      <Panel title="Homerooms" footer={`A homeroom counts as submitted when at least ${Math.round(env().HOMEROOM_SUBMITTED_MIN_RATIO * 100)}% of its enrolled students have a mark in DeansList. Rows appear after the 9:10 job runs.`}>
        <table className="data">
          <thead>
            <tr>
              <th>Homeroom</th>
              <th>Teachers</th>
              <th>Marked</th>
              <th>Status</th>
              <th>Reminded</th>
              <th>Warned</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {configured.map((h) => {
              const s = statusByHomeroom.get(h);
              const submitted = Boolean(s?.submittedSeenAt);
              return (
                <tr key={h}>
                  <td className="font-semibold">{h}</td>
                  <td>{cfg.homerooms[h].teachers.join(', ')}</td>
                  <td>{s ? `${s.rowsSeen}/${s.enrolled}` : '—'}</td>
                  <td>{!s ? <span className="chip chip-none">not checked yet</span> : submitted ? <span className="chip chip-ok">submitted {formatTime(s.submittedSeenAt!)}</span> : <span className="chip chip-bad">missing</span>}</td>
                  <td>{s?.remindedAt ? formatTime(s.remindedAt) : '—'}</td>
                  <td>{s?.escalatedAt ? formatTime(s.escalatedAt) : '—'}</td>
                  <td className="text-xs" style={{ color: '#8a2c1b' }}>
                    {[s?.remindError, s?.escalateError].filter(Boolean).join('; ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Late check-ins" action={<AdminCheckin />} footer="Undo keeps the record and marks the Slack late pass cancelled. An arrival email already sent to a family cannot be unsent.">
        {checkinRows.length === 0 ? (
          <p className="text-sm text-muted px-4 py-3">No check-ins on this day.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Time</th>
                <th>Student</th>
                <th>Homeroom</th>
                <th>Local ID</th>
                <th>Source</th>
                <th>Slack</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {checkinRows.map(({ c, s }) => (
                <tr key={c.id} style={c.undoneAt ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                  <td>{formatTime(c.checkedInAt)}</td>
                  <td>{name(s, c.dlStudentId)}</td>
                  <td>{s?.homeroom ?? ''}</td>
                  <td>{s?.studentSchoolId ?? ''}</td>
                  <td>{c.source}</td>
                  <td>{c.slackTs ? <span className="chip chip-ok">posted</span> : <span className="chip chip-warn" title={c.slackError ?? ''}>{c.slackError ? 'failed' : 'pending'}</span>}</td>
                  <td>{c.undoneAt ? <span className="text-xs text-muted">undone by {c.undoneBy}</span> : <UndoButton id={c.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Family emails" footer="One absence email per absent student at 10:00; an arrival follow-up when the student checks in afterwards. Each guardian address gets its own message.">
        {notices.length === 0 ? (
          <p className="text-sm text-muted px-4 py-3">No family emails on this day.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Student</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Recipients</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {notices.map(({ n, s }) => (
                <tr key={n.id}>
                  <td>{name(s, n.dlStudentId)}</td>
                  <td>{n.kind === 'absent' ? 'absence' : 'arrival'}</td>
                  <td>
                    <span className={`chip ${n.status === 'sent' ? 'chip-ok' : n.status === 'failed' ? 'chip-bad' : 'chip-warn'}`}>{n.status}</span>
                  </td>
                  <td>{n.sentAt ? formatTime(n.sentAt) : '—'}</td>
                  <td>{(n.toEmails ?? []).length}</td>
                  <td className="text-xs" style={{ color: '#8a2c1b' }}>
                    {n.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Jobs" footer="Cloud Scheduler runs these on school days. Run now uses the same code; in DRY RUN it records what it would send.">
        <table className="data">
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>What it does</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(JOBS).map(([jobName, j]) => (
              <tr key={jobName}>
                <td className="font-mono text-xs">{jobName}</td>
                <td>{j.schedule}</td>
                <td>{j.description}</td>
                <td>
                  <RunJobButton job={jobName} isSchoolDay={isSchoolDay(today)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="label px-4 pt-4 pb-1">Recent runs</div>
        <table className="data">
          <thead>
            <tr>
              <th>Started</th>
              <th>Job</th>
              <th>Day</th>
              <th>Status</th>
              <th>By</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{formatTime(r.startedAt)}</td>
                <td className="font-mono text-xs">{r.job}</td>
                <td>{r.runDate}</td>
                <td>
                  <span className={`chip ${r.status === 'ok' ? 'chip-ok' : r.status === 'error' ? 'chip-bad' : r.status === 'skipped' ? 'chip-none' : 'chip-warn'}`}>
                    {r.status}
                    {r.dryRun ? ' (dry)' : ''}
                  </span>
                </td>
                <td className="text-xs">{r.triggeredBy}</td>
                <td className="text-xs font-mono whitespace-pre-wrap break-all" style={{ maxWidth: 480 }}>
                  {r.error ?? (r.job === 'discover' && r.summary && typeof r.summary.text === 'string' ? String(r.summary.text) : JSON.stringify(r.summary ?? {}))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Setup" footer="Teacher assignments and the grade channels live in config/homerooms.json in the repository.">
        <div className="px-4 py-3 space-y-4 text-sm">
          <div>
            <div className="label mb-1">Kiosk devices</div>
            {devices.length === 0 && <p className="text-muted mb-2">No kiosk paired yet.</p>}
            <ul className="mb-2 space-y-1">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <span>{d.label}</span>
                  <span className="text-muted text-xs">paired {d.createdAt.toISOString().slice(0, 10)}{d.lastSeenAt ? `, last seen ${formatTime(d.lastSeenAt)}` : ''}</span>
                  <RevokeKioskButton id={d.id} />
                </li>
              ))}
            </ul>
            <PairKioskButton />
          </div>
          <div>
            <div className="label mb-1">Guardian emails</div>
            <p className="text-muted mb-2">DeansList&apos;s guardian emails are used when it has them. Upload an OnCourse export (columns: Local ID, email) to fill the gaps; an uploaded row wins for that student.</p>
            <GuardianUpload />
          </div>
          {staffRows.length > 0 && (
            <div>
              <div className="label mb-1">Staff not found on Slack</div>
              <ul className="text-xs" style={{ color: '#8a2c1b' }}>
                {staffRows.map((s) => (
                  <li key={s.email}>
                    {s.email}: {s.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>
    </main>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'warn' }) {
  return (
    <div className="panel px-4 py-4">
      <div className="label">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={tone === 'warn' ? { color: '#92400e' } : undefined}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}

function Panel({ title, children, footer, action }: { title: string; children: React.ReactNode; footer?: string; action?: React.ReactNode }) {
  return (
    <section className="panel mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-line">
        <div className="label">{title}</div>
        {action}
      </div>
      {children}
      {footer && <div className="text-xs text-muted px-4 py-2 border-t border-line">{footer}</div>}
    </section>
  );
}
