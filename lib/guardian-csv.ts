/**
 * Parses a CSV of guardian emails (an OnCourse export) into Local ID -> emails.
 * Header names are matched loosely: a column like "Local ID", "StudentSchoolID",
 * "Student ID" or "Student Number" for the id, and any column containing
 * "email" for addresses. Several addresses in one cell may be separated by
 * commas, semicolons or spaces.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParsedGuardianCsv {
  rows: Map<string, string[]>;
  skipped: number;
  error?: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseGuardianCsv(text: string): ParsedGuardianCsv {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: new Map(), skipped: 0, error: 'The file has no data rows.' };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idCol = header.findIndex((h) => /local\s*id|studentschoolid|student\s*(school\s*)?id|student\s*number/.test(h));
  const emailCols = header.map((h, i) => (h.includes('email') ? i : -1)).filter((i) => i >= 0);
  if (idCol < 0 || !emailCols.length) return { rows: new Map(), skipped: 0, error: 'Need a Local ID column and at least one column with "email" in its name.' };
  const rows = new Map<string, string[]>();
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const id = cells[idCol]?.trim();
    const emails = emailCols
      .flatMap((c) => (cells[c] ?? '').split(/[;,\s]+/))
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e));
    if (!id || !emails.length) {
      skipped++;
      continue;
    }
    rows.set(id, Array.from(new Set([...(rows.get(id) ?? []), ...emails])));
  }
  return { rows, skipped };
}
