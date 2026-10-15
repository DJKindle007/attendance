# Kindle Attendance

Late check-in kiosk, attendance reminders for teachers, absence emails for
families, and the end-of-day list of students whose OnCourse mark needs to be
corrected from Absent to Tardy. Built for Kindle Education's middle school.

| When (school time, set in Cloud Scheduler) | What happens |
| --- | --- |
| 6:30 AM | Roster cache refreshed from DeansList (students, homerooms, guardian emails); staff Slack ids cached. |
| 9:10 AM | Today's DeansList daily attendance is pulled. Each homeroom teacher whose homeroom is not submitted gets a Slack DM. |
| 9:20 AM | Pulled again. Teachers still missing get a written-warning email (cc the operations coordinator); the coordinator gets one Slack DM listing them. |
| any time | A late student types their name on the front-desk kiosk and taps "I'm here". A late pass is posted to the grade-level Slack channel. |
| 10:00 AM | Guardians of every student marked absent in DeansList who has not checked in get an email. A student who checks in later triggers an arrival follow-up email with the time. |
| 3:30 PM | An .xlsx of today's late arrivals (name, Local ID, grade, homeroom, time) is sent to the operations coordinator on Slack. It can also be downloaded from the admin page for any day. |

Nothing is sent while `DRY_RUN=true` (the default): every Slack message and
email is logged instead, and the admin page shows "DRY RUN".

## How it works

```
Cloud Scheduler ──POST /api/jobs/<name>──▶ Vercel (Next.js)
                 Authorization: Bearer $JOBS_SECRET      │
                                                         ├─ DeansList API  (v1/students, v1/rosters, v1/daily-attendance, …/codes)
Front-desk iPad ──/kiosk (device cookie)────────────────▶ ├─ Neon Postgres  (roster cache, check-ins, notices, job runs)
Office staff ────/ (Google sign-in, kindleeducation.org)▶ ├─ Slack bot      (DMs, grade channels, file upload)
                                                         └─ Gmail API      (service account sending as a shared mailbox)
```

- `lib/domain/attendance.ts` holds the decisions (which homerooms are missing, who is absent, when a reversal goes out) as pure functions, checked by `npm run check`.
- Every send is claimed in the database first (`homeroom_status.reminded_at`, `parent_notices`), so a retried or re-run job never messages anyone twice.
- A homeroom counts as submitted when at least `HOMEROOM_SUBMITTED_MIN_RATIO` (default 50%) of its enrolled students have a mark. A homeroom with no marks is "unknown": its students are never emailed as absent.
- "Today" is always computed in `TZ_NAME` (America/New_York); jobs skip weekends and the days off in `lib/time.ts`.

## Before relying on the teacher reminders: Phase 0

Two facts about the OnCourse → DeansList sync are not documented and decide
whether the 9:10/9:20 reminders can work from DeansList at all:

1. Does a homeroom whose teacher entered nothing show up in DeansList as **no rows**, or as **Present** for everyone?
2. How often does DeansList import from OnCourse during the morning?

Run the discovery report at about 8:45, 9:05, 9:15 and 9:30 on two or three
school days and compare the "rows per homeroom" lines:

```bash
cp .env.example .env     # fill in DEANSLIST_SUBDOMAIN and DEANSLIST_API_KEY
npm install
npm run discover         # prints field names and counts only, never student values
```

Or, once deployed, press **Run now** on the `discover` job in the admin page.
Also ask DeansList support (support@deanslistsoftware.com) the two questions
directly. Record the answers in `docs/DECISIONS.md` and set the Cloud
Scheduler times after the first import that follows 9:10. If DeansList cannot
tell "not submitted" from "present", only the source behind
`homeroomCoverage()` needs to change; the kiosk, family emails and the
spreadsheet are unaffected.

## Setup

`docs/SETUP.md` walks through Neon, the Slack app, the Google service account,
Vercel and Cloud Scheduler. Teacher assignments and the grade channels live in
`config/homerooms.json`.

## Local development

```bash
cp .env.example .env            # set AUTH_DISABLED=true, AUTH_SECRET=dev, DRY_RUN=true
# a local Postgres:
#   DATABASE_URL=postgresql://user:pass@localhost:5432/attendance_dev
npm install
npm run db:migrate              # applies drizzle/ migrations
npm run mock:deanslist          # fake DeansList at http://localhost:4010/api (scenarios: none | 6a-missing | all)
# in .env: DEANSLIST_BASE_URL=http://localhost:4010/api  DEANSLIST_API_KEY=mock
npm run dev                     # http://localhost:3000 (admin), /kiosk (after pairing from the admin page)
curl -X POST -H "Authorization: Bearer $JOBS_SECRET" localhost:3000/api/jobs/refresh-roster
curl -X POST -H "Authorization: Bearer $JOBS_SECRET" -H "Content-Type: application/json" -d '{"force":true}' localhost:3000/api/jobs/remind-teachers
```

`{"force":true}` runs a job on a non-school day; `{"date":"YYYY-MM-DD"}` runs
it for another day.

## Checks

```bash
npm run check       # assertions over the attendance logic, time zones, templates, xlsx
npm run typecheck
npm run lint
npm run build
```

## Layout

```
app/                 admin page (/), kiosk (/kiosk), sign-in, API routes (/api/jobs, /api/kiosk, /api/admin)
components/          client pieces of the kiosk and admin pages
config/homerooms.json  homeroom → teachers, grade channels, ops coordinator, school name
db/                  drizzle schema and client; drizzle/ holds migrations
lib/deanslist/       API client, row types, normalization, Phase 0 discovery
lib/domain/          pure decisions: coverage, absences, reversals, report rows
lib/jobs/            the five scheduled jobs plus discover, and the runner with its lock and school-day gate
lib/                 slack.ts, gmail.ts, email-templates.ts, xlsx.ts, checkin.ts, notices.ts, time.ts, config.ts
scripts/             check-attendance.ts (tests), discover-deanslist.ts, mock-deanslist.ts
docs/                SETUP.md, DECISIONS.md
```
