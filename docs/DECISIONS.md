# Decision log, Kindle Attendance

The durable record of product and data choices. Update it whenever a decision lands.

## Scope and sources (2026-10-15)

- **DeansList is the data source**, not OnCourse. OnCourse feeds DeansList; the app reads `v1/students` (roster, Local ID as `StudentSchoolID`, guardian emails from `Parents[]`), `v1/rosters` (Homeroom-type rosters fill a blank Homeroom field), `v1/daily-attendance` (today's marks, always requested with `sdt=edt=today` and filtered again by `BehaviorDate`) and `v1/daily-attendance/codes` (a code is "absent" only when its `AbsentTardy` letter is `A`; unknown codes are read from their name). Client and types are trimmed copies of `deanslist-dashboard`.
- **Local ID instead of State ID** on the tardy spreadsheet: DeansList's `StudentSchoolID` is the OnCourse Local ID, and that is what the office uses to find the student.
- **Phase 0 before trusting the reminders.** Whether an unsubmitted homeroom appears in DeansList as no rows or as Present, and how often OnCourse data is imported, are undocumented. `scripts/discover-deanslist.ts` (and the `discover` job) print field names and rows per homeroom, never values. Until it is answered, the reminder jobs run in DRY_RUN. The kiosk, family emails and the spreadsheet do not depend on the answer.
- **Hosting**: Next.js 14 on Vercel (Hobby) like the dashboards, Neon Postgres over the HTTP driver, and Google Cloud Scheduler calling `POST /api/jobs/<name>` with a bearer secret. Vercel Hobby cron allows one run a day and 60 s per function, so the schedule lives in Cloud Scheduler and every job route declares `maxDuration = 60`.

## Decisions in the logic (2026-10-15)

- **A homeroom is "submitted"** when at least `HOMEROOM_SUBMITTED_MIN_RATIO` (default 0.5) of its enrolled students have a mark today, not when any one student does: the office entering one early arrival must not silence the reminder. A configured homeroom with no enrolled students is never missing. Homerooms DeansList has that `config/homerooms.json` lacks are reported to the operations coordinator, never reminded.
- **Teacher ownership is a config file** (`config/homerooms.json`: homeroom → grade and one or more teacher emails), changed by pull request. Slack ids are resolved from email with `users.lookupByEmail` and cached in the `staff` table for a week, because that call is rate limited.
- **Unknown is not absent.** A student with no mark in an unsubmitted homeroom is never emailed; the 10:00 summary to the operations coordinator says how many were skipped and which homerooms.
- **Only "absent" codes trigger a family email.** Tardy, half day, ISS and OSS do not; excused and unexcused absences both do (the email asks the family to reply if the absence should be excused).
- **One email per guardian address**, never a shared To line: separated households must not see each other's address. Replies go to the operations coordinator.
- **Reversal rule**: an arrival follow-up goes out exactly once when an absence notice exists for the student today and the student has an active check-in, whichever happened first. The kiosk checks after each check-in; the 10:00 job sweeps after sending, which closes the gap between its snapshot and its sends.
- **Claims before sends.** `homeroom_status.reminded_at` / `escalated_at` are set with `UPDATE … WHERE … IS NULL RETURNING`; `parent_notices` has a unique index on (day, student, kind) and is inserted `ON CONFLICT DO NOTHING RETURNING`. A send happens only when the claim came back; a failed send releases it so the next run retries. Jobs answer 200 with per-recipient failures in the summary and 503 only when DeansList or the database is unreachable, so Cloud Scheduler retries only then. A partial unique index on `job_runs` (status = running) stops overlapping runs; a lock older than 90 s is reclaimed.
- **Check-ins are never deleted.** Undo sets `undone_at`; the partial unique index on active check-ins makes a double tap a no-op answered "already checked in", and a re-check-in after an undo is a new row. Undo rewrites the Slack late pass as cancelled; an arrival email already sent cannot be unsent and the admin page says so.
- **Late pass goes to the grade channel only** (#ms-6th-gradeteam, #ms-7th-gradeteam, #ms-8th-gradeteam), mapped from the student's grade in config.
- **The kiosk needs no login.** A device is paired once from the admin page with a link that sets a one-year HttpOnly cookie; only the SHA-256 of the token is stored. The kiosk search returns names and homerooms, never ids the student could use elsewhere; results need at least two typed characters and stop at eight.
- **Time zone**: "today" is `formatInTimeZone(now, TZ_NAME)`; the school calendar (days off copied from the dashboard's `schoolCalendar.ts`) is compared on `YYYY-MM-DD` strings so the UTC server never shifts a date. Cloud Scheduler jobs carry the time zone, so DST needs no handling here.
- **Guardian emails**: DeansList `Parents[]` (guardian-flagged parents, or all parents when none is flagged) with an uploaded OnCourse CSV winning per student (`guardian_contacts`). Students with no address are counted on the admin page and in the 10:00 summary.
- **DRY_RUN defaults to true.** A fresh deploy sends nothing until someone sets it to false. In DRY_RUN the database claims are still recorded (marked `dry_run` on the run), so a dry morning reads exactly like a live one.
- **No transactions.** Every mutation is one statement, which is what the Neon HTTP driver supports; locally a plain Postgres is used through node-postgres when `DATABASE_URL` points at localhost or `DB_DRIVER=pg`.

## Open items

1. Phase 0 answers (see README), then the final scheduler times and `HOMEROOM_SUBMITTED_MIN_RATIO`.
2. If DeansList shows Present for untaken homerooms: an OnCourse adapter behind `homeroomCoverage()` (its "attendance not taken" data via export or API) for the two reminder jobs.
3. Email wording in `lib/email-templates.ts` is a neutral default; the school's family-communication lead should review it before `DRY_RUN=false`.
4. The 9:20 warning is also an email to the teacher; whether it should additionally copy the principal is a school decision (one line in `lib/jobs/escalate-teachers.ts`).
