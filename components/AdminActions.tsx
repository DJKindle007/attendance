'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function post(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function RunJobButton({ job, isSchoolDay }: { job: string; isSchoolDay: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          const force = !isSchoolDay && confirm('Today is not a school day. Run anyway?');
          if (!isSchoolDay && !force) return;
          setBusy(true);
          setMsg(null);
          const { ok, data } = await post('/api/admin/run-job', { job, force });
          setMsg(ok ? `${data.status}${data.error ? `: ${data.error}` : ''}` : `error: ${data.error ?? 'failed'}`);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? 'Running…' : 'Run now'}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

export function UndoButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-danger"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Undo this check-in? The late pass in Slack will be marked cancelled.')) return;
        setBusy(true);
        const { data } = await post('/api/admin/undo-checkin', { id });
        if (data.reversalAlreadySent) alert('Undone. Note: the family already received an arrival email, which cannot be unsent.');
        setBusy(false);
        router.refresh();
      }}
    >
      Undo
    </button>
  );
}

export function PairKioskButton() {
  const [link, setLink] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const label = prompt('Name for this device (e.g. Front desk iPad)', 'Front desk iPad');
          if (label === null) return;
          const { ok, data } = await post('/api/admin/kiosk-devices', { label });
          if (ok) {
            setLink(data.pairUrl);
            router.refresh();
          } else alert(data.error ?? 'failed');
        }}
      >
        Pair a kiosk
      </button>
      {link && (
        <div className="mt-2 text-sm">
          Open this link <strong>once</strong> on the kiosk device (it is shown only now):
          <div className="mt-1 break-all font-mono text-xs panel p-2">{link}</div>
        </div>
      )}
    </div>
  );
}

export function RevokeKioskButton({ id }: { id: number }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-danger"
      onClick={async () => {
        if (!confirm('Revoke this device? It will need to be paired again.')) return;
        await post('/api/admin/kiosk-devices', { id }, 'DELETE');
        router.refresh();
      }}
    >
      Revoke
    </button>
  );
}

export function GuardianUpload() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const res = await fetch('/api/admin/guardians-upload', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        setMsg(res.ok ? `Saved emails for ${data.students} students (${data.skipped} rows skipped).` : `Error: ${data.error ?? 'upload failed'}`);
        form.reset();
        router.refresh();
      }}
    >
      <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
      <button type="submit" className="btn">
        Upload guardian emails (CSV)
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </form>
  );
}

export function AdminCheckin() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<{ id: string; name: string; homeroom: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <div className="flex gap-2 items-center">
        <input
          value={q}
          placeholder="Student name"
          className="px-3 py-2 rounded-md border border-line text-sm"
          onChange={async (e) => {
            const v = e.target.value;
            setQ(v);
            if (v.trim().length < 2) return setMatches([]);
            const res = await fetch(`/api/admin/students/search?q=${encodeURIComponent(v.trim())}`);
            if (res.ok) setMatches(((await res.json()) as { students: typeof matches }).students);
          }}
        />
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
      {matches.length > 0 && (
        <ul className="mt-2 panel divide-y divide-line max-w-md">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {m.name} <span className="text-muted">{m.homeroom}</span>
              </span>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const { ok, data } = await post('/api/admin/checkin', { dlStudentId: m.id });
                  setMsg(ok ? (data.alreadyCheckedIn ? `${data.studentName} was already checked in at ${data.checkedInAtText}.` : `${data.studentName} checked in at ${data.checkedInAtText}.`) : `Error: ${data.error}`);
                  setQ('');
                  setMatches([]);
                  router.refresh();
                }}
              >
                Check in
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
