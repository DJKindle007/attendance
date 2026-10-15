'use client';

import { useEffect, useRef, useState } from 'react';

interface Match {
  id: string;
  name: string;
  homeroom: string;
  grade: string;
}

type Phase = { kind: 'search' } | { kind: 'confirm'; student: Match } | { kind: 'done'; name: string; at: string; already: boolean } | { kind: 'error'; message: string };

const RESET_MS = 8000;

export default function KioskClient({ schoolName }: { schoolName: string }) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'search' });
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/kiosk/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (res.ok) setMatches(((await res.json()) as { students: Match[] }).students);
      } catch {
        /* typing continues */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    if (phase.kind !== 'done' && phase.kind !== 'error') return;
    const t = setTimeout(reset, RESET_MS);
    return () => clearTimeout(t);
  }, [phase]);

  function reset() {
    setPhase({ kind: 'search' });
    setQ('');
    setMatches([]);
    setBusy(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function confirm(student: Match) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/kiosk/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dlStudentId: student.id }) });
      const data = (await res.json()) as { alreadyCheckedIn?: boolean; studentName?: string; checkedInAtText?: string; error?: string };
      if (!res.ok) setPhase({ kind: 'error', message: data.error ?? 'Something went wrong. Please tell the office.' });
      else setPhase({ kind: 'done', name: data.studentName ?? student.name, at: data.checkedInAtText ?? '', already: Boolean(data.alreadyCheckedIn) });
    } catch {
      setPhase({ kind: 'error', message: 'No connection. Please tell the office.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6 sm:p-10 select-none">
      <header className="w-full max-w-xl flex items-center gap-3 mb-6">
        <img src="https://images.squarespace-cdn.com/content/v1/632fd47c6695d574095f511f/947a9b64-46c2-4575-b420-0c4feb5b2459/LogoOrange.png" alt="" width={40} height={40} />
        <div>
          <div className="font-bold text-lg leading-tight">Late check-in</div>
          <div className="text-sm text-muted">{schoolName}</div>
        </div>
      </header>

      {phase.kind === 'search' && (
        <section className="w-full max-w-xl panel p-6">
          <label htmlFor="q" className="label block mb-2">
            Type your name
          </label>
          <input
            id="q"
            ref={inputRef}
            autoFocus
            autoComplete="off"
            inputMode="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) setMatches([]);
            }}
            placeholder="First or last name"
            className="w-full text-2xl px-4 py-4 rounded-md border border-line bg-white"
          />
          <ul className="mt-4 divide-y divide-line">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setPhase({ kind: 'confirm', student: m })} className="w-full text-left py-4 px-2 flex items-center justify-between hover:bg-accent-soft rounded-md">
                  <span className="text-xl font-semibold">{m.name}</span>
                  <span className="text-muted text-base">{m.homeroom}</span>
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && matches.length === 0 && <li className="py-4 text-muted">No match yet. Keep typing, or ask the office.</li>}
          </ul>
        </section>
      )}

      {phase.kind === 'confirm' && (
        <section className="w-full max-w-xl panel p-8 text-center">
          <div className="label mb-2">Is this you?</div>
          <div className="text-3xl font-bold">{phase.student.name}</div>
          <div className="text-muted mt-1 text-lg">{phase.student.homeroom}</div>
          <div className="mt-8 flex gap-3 justify-center">
            <button type="button" className="btn text-lg px-6 py-4" onClick={reset} disabled={busy}>
              No, go back
            </button>
            <button type="button" className="btn btn-primary text-lg px-8 py-4" onClick={() => confirm(phase.student)} disabled={busy}>
              {busy ? 'One moment…' : "Yes, I'm here"}
            </button>
          </div>
        </section>
      )}

      {phase.kind === 'done' && (
        <section className="w-full max-w-xl panel p-8 text-center">
          <div className="text-5xl mb-3">{phase.already ? '✅' : '👋'}</div>
          <div className="text-2xl font-bold">{phase.already ? `Already checked in at ${phase.at}` : `Welcome back, ${phase.name.split(' ')[0]}.`}</div>
          <div className="text-lg text-muted mt-2">{phase.already ? 'You are all set. Head to class.' : `Checked in at ${phase.at}. Head to class.`}</div>
          <button type="button" className="btn mt-8" onClick={reset}>
            Done
          </button>
        </section>
      )}

      {phase.kind === 'error' && (
        <section className="w-full max-w-xl panel p-8 text-center">
          <div className="text-2xl font-bold" style={{ color: '#8a2c1b' }}>
            Could not check you in
          </div>
          <div className="text-muted mt-2">{phase.message}</div>
          <button type="button" className="btn mt-8" onClick={reset}>
            Try again
          </button>
        </section>
      )}
    </main>
  );
}
