/**
 * A stand-in for the four DeansList endpoints the app uses, for dry runs
 * without a key. Start it, then point the app at it:
 *
 *   npm run mock:deanslist                # http://localhost:4010/api
 *   DEANSLIST_BASE_URL=http://localhost:4010/api DEANSLIST_API_KEY=mock npm run dev
 *
 * Scenarios (MOCK_SCENARIO env or GET /__scenario?name=...):
 *   none           nobody has submitted yet
 *   6a-missing     every homeroom except 6A is submitted (default)
 *   all            everything submitted, two students absent, one tardy
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 4010);
let scenario = process.env.MOCK_SCENARIO || '6a-missing';

const homerooms = ['6A', '6B', '6C', '7A', '7B', '7C', '8A', '8B', '8C'];
const firsts = ['Ada', 'Alan', 'Grace', 'Linus', 'Katherine', 'Edsger', 'Barbara', 'Dennis', 'Margaret', 'Tim', 'Radia', 'Donald'];
const lasts = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Johnson', 'Dijkstra', 'Liskov', 'Ritchie', 'Hamilton', 'Berners-Lee', 'Perlman', 'Knuth'];

const students = homerooms.flatMap((h, hi) =>
  Array.from({ length: 12 }, (_, i) => {
    const n = hi * 12 + i + 1;
    return {
      StudentID: String(1000 + n),
      StudentSchoolID: `K-${String(n).padStart(4, '0')}`,
      FirstName: firsts[i],
      LastName: lasts[(i + hi) % lasts.length],
      PreferredName: i === 1 ? 'Al' : '',
      GradeLevelShort: `${h[0]}th`,
      GradeLevel: `${h[0]}th Grade`,
      Homeroom: h,
      EnrollmentStatus: i === 11 ? 'Not Enrolled' : 'Enrolled',
      Parents: i === 10 ? [] : [{ FirstName: 'Parent', LastName: lasts[(i + hi) % lasts.length], Email: `parent${n}@example.com`, Guardian: 'Y', Relationship: 'Mother' }],
    };
  })
);

const rosters = homerooms.map((h, i) => ({
  RosterID: String(10 + i),
  RosterName: h,
  RosterType: 'Homeroom',
  Active: 'Y',
  TakeAttendance: 'Y',
  StudentIDs: students.filter((s) => s.Homeroom === h).map((s) => s.StudentID).join(','),
}));

const codes = [
  { ActionID: '1', ActionName: 'Present', Weight: '1.000', WeightDenominator: '1', AbsentTardy: 'P', IsExcused: false },
  { ActionID: '2', ActionName: 'Absent - Unexcused', Weight: '0.000', WeightDenominator: '1', AbsentTardy: 'A', IsExcused: false },
  { ActionID: '3', ActionName: 'Absent - Excused', Weight: '0.000', WeightDenominator: '1', AbsentTardy: 'A', IsExcused: true },
  { ActionID: '4', ActionName: 'Tardy - Unexcused', Weight: '1.000', WeightDenominator: '1', AbsentTardy: 'T', IsExcused: false },
  { ActionID: '5', ActionName: 'OSS', Weight: '0.000', WeightDenominator: '1', AbsentTardy: 'O', IsExcused: false },
];

function attendanceRows(date: string) {
  const submitted = scenario === 'none' ? [] : scenario === 'all' ? homerooms : homerooms.filter((h) => h !== '6A');
  const rows: Record<string, unknown>[] = [];
  let said = 1;
  for (const s of students) {
    if (!submitted.includes(s.Homeroom) || s.EnrollmentStatus !== 'Enrolled') continue;
    const idx = Number(s.StudentID) % 12;
    const code = idx === 2 ? 'Absent - Unexcused' : idx === 3 ? 'Absent - Excused' : idx === 4 ? 'Tardy - Unexcused' : idx === 5 && s.Homeroom === '8C' ? 'OSS' : 'Present';
    rows.push({ DLSAID: String(900000 + said++), DLStudentID: s.StudentID, BehaviorDate: date, Behavior: code, BehaviorCategory: 'Daily Attendance', RosterName: s.Homeroom });
  }
  return rows;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/__scenario') {
    const name = url.searchParams.get('name');
    if (name) scenario = name;
    return send(200, { scenario });
  }
  if (!url.searchParams.get('apikey')) return send(403, { error: 'missing apikey' });
  const path = url.pathname.replace(/^\/api\//, '');
  if (path === 'v1/students') return send(200, { rowcount: students.length, total_pages: 1, data: students });
  if (path === 'v1/rosters') return send(200, { rowcount: rosters.length, data: rosters });
  if (path === 'v1/daily-attendance/codes') return send(200, { rowcount: codes.length, data: codes });
  if (path === 'v1/daily-attendance') {
    const date = url.searchParams.get('sdt') || new Date().toISOString().slice(0, 10);
    const rows = attendanceRows(date);
    return send(200, { rowcount: rows.length, data: rows });
  }
  send(404, { error: `no mock for ${path}` });
});

server.listen(PORT, () => {
  console.log(`mock DeansList at http://localhost:${PORT}/api  (scenario: ${scenario}; change with /__scenario?name=none|6a-missing|all)`);
});
