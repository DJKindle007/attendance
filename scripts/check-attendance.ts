/**
 * Assertions over the pure logic: who is reminded, who is emailed, when a
 * reversal goes out, what the spreadsheet holds, and school-day/time-zone
 * handling. Run: npm run check
 */
import assert from 'node:assert/strict';
import { absentStudents, guardianEmailsFor, homeroomCoverage, missingHomerooms, needsReversal, unconfiguredHomerooms } from '../lib/domain/attendance';
import { tardyRows } from '../lib/domain/report';
import { attendanceCodeRules, guardianEmailsFromStudent, inferAttendanceRule, marksFromRows, normalizeStudents, statusForCode, type CachedStudent } from '../lib/deanslist/normalize';
import { dateKeyInTz, formatTime, isSchoolDay, todayKey } from '../lib/time';
import { parentAbsence, parentReversal, teacherWarning } from '../lib/email-templates';
import { buildTardyXlsx } from '../lib/xlsx';
import { SchoolConfigSchema } from '../lib/config';
import homeroomsJson from '../config/homerooms.json';
import { parseGuardianCsv } from '../lib/guardian-csv';

// ---- config file is valid ----
const cfg = SchoolConfigSchema.parse(homeroomsJson);
assert.ok(Object.keys(cfg.homerooms).length >= 9, 'config lists the middle school homerooms');
assert.deepEqual(Object.keys(cfg.gradeChannels).sort(), ['6th', '7th', '8th']);

// ---- school days and time zones ----
assert.equal(isSchoolDay('2026-10-15'), true, 'a Thursday in October');
assert.equal(isSchoolDay('2026-10-12'), false, 'Indigenous Peoples Day is off');
assert.equal(isSchoolDay('2026-10-17'), false, 'Saturday');
assert.equal(isSchoolDay('2026-10-18'), false, 'Sunday');
assert.equal(isSchoolDay('2026-09-07'), false, 'the day before the first day of school');
assert.equal(isSchoolDay('2026-09-08'), true, 'first day');
assert.equal(isSchoolDay('2027-06-28'), false, 'after the last day');
assert.equal(isSchoolDay('garbage'), false);
// 2026-11-01 is the fall DST change in New York. 03:30 UTC is still 23:30 Oct 31 EDT.
assert.equal(dateKeyInTz(new Date('2026-11-01T03:30:00Z'), 'America/New_York'), '2026-10-31');
assert.equal(dateKeyInTz(new Date('2026-11-01T05:30:00Z'), 'America/New_York'), '2026-11-01');
// 2027-03-14 is the spring change. 06:30 UTC is 01:30 EST, still Mar 14; 04:30 UTC is 23:30 Mar 13.
assert.equal(dateKeyInTz(new Date('2027-03-14T06:30:00Z'), 'America/New_York'), '2027-03-14');
assert.equal(dateKeyInTz(new Date('2027-03-14T04:30:00Z'), 'America/New_York'), '2027-03-13');
assert.equal(todayKey(new Date('2026-10-15T13:10:00Z'), 'America/New_York'), '2026-10-15');
assert.equal(formatTime(new Date('2026-10-15T12:47:00Z'), 'America/New_York'), '8:47 AM');
console.log('time assertions passed');

// ---- attendance codes ----
const codes = [
  { ActionName: 'Present', AbsentTardy: 'P', IsExcused: false },
  { ActionName: 'Absent - Excused', AbsentTardy: 'A', IsExcused: true },
  { ActionName: 'Absent - Unexcused', AbsentTardy: 'A', IsExcused: false },
  { ActionName: 'Tardy - Unexcused', AbsentTardy: 'T', IsExcused: false },
  { ActionName: 'Half Day', AbsentTardy: 'D', IsExcused: false },
  { ActionName: 'ISS', AbsentTardy: 'I', IsExcused: false },
  { ActionName: 'OSS', AbsentTardy: 'O', IsExcused: false },
];
const rules = attendanceCodeRules(codes);
assert.equal(statusForCode('Absent - Unexcused', rules).status, 'absent');
assert.equal(statusForCode('OSS', rules).status, 'oss');
assert.deepEqual(inferAttendanceRule('Absent - Trip'), { status: 'absent', excused: false, known: false }, 'unknown absence code inferred from its name');
assert.equal(statusForCode('Absent - Trip', rules).known, false);
assert.equal(inferAttendanceRule('Late to School').status, 'tardy');

// ---- roster normalization ----
const dlStudents = [
  { StudentID: '101', StudentSchoolID: 'K-0101', FirstName: 'Ada', LastName: 'Lovelace', GradeLevelShort: '6th', Homeroom: '6A', Parents: [{ Email: 'Mom@Example.com', Guardian: 'Y' }, { Email: 'uncle@example.com', Guardian: 'N' }] },
  { StudentID: '102', StudentSchoolID: 'K-0102', FirstName: 'Alan', LastName: 'Turing', PreferredName: 'Al', GradeLevelShort: '6th', Homeroom: '6A', Parents: [{ Email: 'dad@example.com' }, { Email: 'dad@example.com' }] },
  { StudentID: '103', StudentSchoolID: 'K-0103', FirstName: 'Grace', LastName: 'Hopper', GradeLevelShort: '6th', Homeroom: '', Parents: [] },
  { StudentID: '104', StudentSchoolID: 'K-0104', FirstName: 'Left', LastName: 'School', GradeLevelShort: '7th', Homeroom: '7A', EnrollmentStatus: 'Not Enrolled' },
  { StudentID: '105', StudentSchoolID: 'K-0105', FirstName: 'Zed', LastName: 'Zero', GradeLevelShort: '7th', Homeroom: '7A', EnrollmentStatus: 'Enrolled', Parents: [{ Email: 'not an email' }] },
  { StudentID: '106', StudentSchoolID: 'K-0106', FirstName: 'New', LastName: 'Room', GradeLevelShort: '8th', Homeroom: '8Z', EnrollmentStatus: 'Enrolled' },
];
const rosters = [{ RosterID: 'r1', RosterName: '6B', RosterType: 'Homeroom', Active: 'Y', StudentIDs: '103' }, { RosterID: 'r2', RosterName: 'Algebra', RosterType: 'Class', Active: 'Y', StudentIDs: '101,102,103' }];
const students = normalizeStudents(dlStudents, rosters);
const byId = new Map(students.map((s) => [s.dlStudentId, s]));
assert.deepEqual(guardianEmailsFromStudent(dlStudents[0]), ['mom@example.com'], 'only guardians when any parent is flagged, lowercased');
assert.deepEqual(byId.get('102')!.guardianEmails, ['dad@example.com'], 'every parent when none is flagged, deduped');
assert.deepEqual(byId.get('105')!.guardianEmails, [], 'invalid address dropped');
assert.equal(byId.get('103')!.homeroom, '6B', 'blank homeroom filled from the Homeroom roster, never from a class');
assert.equal(byId.get('104')!.enrolled, false);
assert.equal(byId.get('105')!.enrolled, true);
assert.equal(byId.get('101')!.studentSchoolId, 'K-0101');
console.log('roster assertions passed');

// ---- homeroom coverage ----
const miniConfig = { homerooms: { '6A': { grade: '6th', teachers: ['six-a@kindleeducation.org'] }, '6B': { grade: '6th', teachers: ['six-b@kindleeducation.org', 'co@kindleeducation.org'] }, '7A': { grade: '7th', teachers: ['seven-a@kindleeducation.org'] }, '7B': { grade: '7th', teachers: ['seven-b@kindleeducation.org'] } } };
const noMarks = marksFromRows([], codes);
let cov = homeroomCoverage(students, noMarks, miniConfig);
assert.deepEqual(missingHomerooms(cov).map((c) => c.homeroom), ['6A', '6B', '7A'], 'nothing submitted: every configured homeroom with students is missing');
assert.deepEqual(unconfiguredHomerooms(cov).map((c) => c.homeroom), ['8Z'], 'a DeansList homeroom not in config is reported');
assert.equal(cov.find((c) => c.homeroom === '7B')!.enrolled, 0, 'configured homeroom with no students');
assert.equal(cov.find((c) => c.homeroom === '7B')!.submitted, true, 'and it is never "missing"');
assert.equal(cov.find((c) => c.homeroom === '7A')!.enrolled, 1, 'unenrolled students do not count');
assert.deepEqual(cov.find((c) => c.homeroom === '6B')!.teachers, ['six-b@kindleeducation.org', 'co@kindleeducation.org'], 'co-teachers kept');

// 6A has 2 enrolled (101, 102). One row = 50% = submitted at the default ratio, but not at 0.75.
const oneRow = marksFromRows([{ DLSAID: 'a1', DLStudentID: '101', BehaviorDate: '2026-10-15', Behavior: 'Present' }], codes);
assert.equal(homeroomCoverage(students, oneRow, miniConfig, 0.75).find((c) => c.homeroom === '6A')!.submitted, false, '1 of 2 rows is not enough at 0.75');
assert.equal(homeroomCoverage(students, oneRow, miniConfig, 0.5).find((c) => c.homeroom === '6A')!.submitted, true, '1 of 2 rows is enough at 0.5');
const bigRoom: CachedStudent[] = Array.from({ length: 25 }, (_, i) => ({ dlStudentId: `b${i}`, studentSchoolId: `B-${i}`, firstName: `S${i}`, lastName: 'Big', preferredName: null, grade: '7th', homeroom: '7B', guardianEmails: [], enrolled: true, enrollmentStatus: 'Enrolled' }));
const mark = (ids: string[]) => marksFromRows(ids.map((id) => ({ DLSAID: `m${id}`, DLStudentID: id, BehaviorDate: '2026-10-15', Behavior: 'Present' })), codes);
assert.equal(homeroomCoverage(bigRoom, mark(['b0']), miniConfig).find((c) => c.homeroom === '7B')!.submitted, false, '1 of 25 is a stray row, not a submission');
assert.equal(homeroomCoverage(bigRoom, mark(bigRoom.slice(0, 13).map((s) => s.dlStudentId)), miniConfig).find((c) => c.homeroom === '7B')!.submitted, true, '13 of 25 is submitted');
console.log('coverage assertions passed');

// ---- who gets the absence email ----
const marks = marksFromRows(
  [
    { DLSAID: 'a1', DLStudentID: '101', BehaviorDate: '2026-10-15', Behavior: 'Absent - Unexcused' },
    { DLSAID: 'a2', DLStudentID: '102', BehaviorDate: '2026-10-15', Behavior: 'Absent - Excused' },
    { DLSAID: 'a3', DLStudentID: '103', BehaviorDate: '2026-10-15', Behavior: 'Tardy - Unexcused' },
    { DLSAID: 'a4', DLStudentID: '104', BehaviorDate: '2026-10-15', Behavior: 'Absent - Unexcused' }, // not enrolled
    { DLSAID: 'a5', DLStudentID: '106', BehaviorDate: '2026-10-15', Behavior: 'OSS' },
  ],
  codes
);
cov = homeroomCoverage(students, marks, miniConfig);
let decision = absentStudents(students, marks, new Set(), cov);
assert.deepEqual(decision.absent.map((s) => s.dlStudentId), ['101', '102'], 'excused and unexcused absences are both emailed; tardy, OSS and unenrolled are not');
assert.deepEqual(decision.unknown.map((s) => s.dlStudentId), ['105'], '7A was never submitted, so Zed is unknown, not absent');
decision = absentStudents(students, marks, new Set(['101']), cov);
assert.deepEqual(decision.absent.map((s) => s.dlStudentId), ['102'], 'a student who checked in at 8:50 is not emailed');
assert.deepEqual(decision.checkedIn.map((s) => s.dlStudentId), ['101']);
console.log('absence assertions passed');

// ---- reversal rule ----
assert.equal(needsReversal({ absentNoticeExists: false, activeCheckin: true, reversalExists: false }), false, 'check-in at 9:50, before any notice: nothing to reverse');
assert.equal(needsReversal({ absentNoticeExists: true, activeCheckin: true, reversalExists: false }), true, 'check-in at 10:30 after the notice: reverse once');
assert.equal(needsReversal({ absentNoticeExists: true, activeCheckin: true, reversalExists: true }), false, 'never twice');
assert.equal(needsReversal({ absentNoticeExists: true, activeCheckin: false, reversalExists: false }), false, 'undone check-in: no reversal');

// ---- guardian emails: upload wins ----
const uploads = new Map([['K-0101', ['Override@Example.com']]]);
assert.deepEqual(guardianEmailsFor(byId.get('101')!, uploads), ['override@example.com']);
assert.deepEqual(guardianEmailsFor(byId.get('102')!, uploads), ['dad@example.com']);
assert.deepEqual(guardianEmailsFor(byId.get('105')!, uploads), [], 'no contact, no crash');

// ---- guardian CSV upload ----
const csv = parseGuardianCsv('\uFEFFLocal ID,Student Name,Guardian 1 Email,Guardian 2 Email\nK-0101,"Lovelace, Ada",MOM@example.com,dad@example.com\nK-0102,"Turing, Alan",,\nK-0103,"Hopper, Grace","a@example.com; b@example.com",\n,"No Id",x@example.com\n');
assert.deepEqual(csv.rows.get('K-0101'), ['mom@example.com', 'dad@example.com']);
assert.deepEqual(csv.rows.get('K-0103'), ['a@example.com', 'b@example.com'], 'several addresses in one cell');
assert.equal(csv.rows.has('K-0102'), false);
assert.equal(csv.skipped, 2, 'no email and no id rows skipped');
assert.ok(parseGuardianCsv('Name,Phone\nx,y').error, 'missing columns reported');
console.log('guardian csv assertions passed');

// ---- tardy report rows ----
const tz = 'America/New_York';
const rows = tardyRows(
  [
    { dlStudentId: '102', checkedInAt: new Date('2026-10-15T12:47:00Z'), undoneAt: null },
    { dlStudentId: '101', checkedInAt: new Date('2026-10-15T13:05:00Z'), undoneAt: null },
    { dlStudentId: '103', checkedInAt: new Date('2026-10-15T13:06:00Z'), undoneAt: new Date('2026-10-15T13:07:00Z') }, // undone
    { dlStudentId: '106', checkedInAt: new Date('2026-10-15T13:08:00Z'), undoneAt: null },
    { dlStudentId: '999', checkedInAt: new Date('2026-10-15T13:09:00Z'), undoneAt: null }, // unknown student
  ],
  byId,
  marks,
  tz
);
assert.deepEqual(rows.map((r) => r.localId), ['K-0101', 'K-0102', 'K-0106'], 'sorted by grade, homeroom, last name; undone and unknown dropped; Local ID is StudentSchoolID');
assert.equal(rows[1].arrivedAtText, '8:47 AM');
assert.equal(rows[1].firstName, 'Alan (Al)');
assert.equal(rows[0].deansListMark, 'Absent - Unexcused');
assert.equal(tardyRows([], byId, marks, tz).length, 0, 'empty day');
console.log('report assertions passed');

// ---- email templates and xlsx ----
const warn = teacherWarning({ teacherName: 'Ms. Carlson', homeroom: '6A', dateKey: '2026-10-15', deadline: '9:10 AM', schoolName: 'Kindle', opsEmail: 'ops@kindleeducation.org' });
assert.match(warn.subject, /6A/);
assert.match(warn.text, /9:10 AM/);
assert.ok(!/undefined/.test(warn.text + warn.html), 'no unfilled placeholder');
const abs = parentAbsence({ studentName: 'Ada Lovelace', dateKey: '2026-10-15', schoolName: 'Kindle', opsEmail: 'ops@kindleeducation.org' });
assert.match(abs.text, /Ada Lovelace/);
assert.match(abs.text, /Thursday, October 15, 2026/);
const rev = parentReversal({ studentName: 'Ada Lovelace', dateKey: '2026-10-15', arrivedAt: '10:32 AM', schoolName: 'Kindle', opsEmail: 'ops@kindleeducation.org' });
assert.match(rev.text, /10:32 AM/);
assert.ok(!/undefined/.test(abs.text + abs.html + rev.text + rev.html));

buildTardyXlsx(rows, '2026-10-15').then((buf) => {
  assert.ok(buf.length > 1000, 'xlsx has content');
  assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'xlsx is a zip');
  console.log('template and xlsx assertions passed');
  console.log('check-attendance: all assertions passed');
});
