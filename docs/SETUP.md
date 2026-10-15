# Setup

Everything below is done once. Order matters only where noted.

## 0. Previewing before anything is set up

Deploy to Vercel with just two environment variables: `AUTH_DISABLED=true` and `DRY_RUN=true`. The admin page then opens without sign-in and shows a setup checklist instead of data; the kiosk shows its "not paired" screen. A red **SIGN-IN IS OFF** banner stays on the admin page until `AUTH_DISABLED` is removed. Do not load the roster (step 9) while it is on: anyone with the URL could read student names.

## 1. Neon (database)

1. Create a project at neon.tech; copy the pooled connection string.
2. Locally: put it in `.env` as `DATABASE_URL` and run `npm run db:migrate`.
   Re-run `db:migrate` after any change to `db/schema.ts` (`npm run db:generate` first to write the migration).

## 2. Slack app

1. api.slack.com/apps → Create New App → From scratch, in the Kindle workspace. Name it "Attendance".
2. OAuth & Permissions → Bot Token Scopes: `chat:write`, `files:write`, `users:read`, `users:read.email`, `im:write`.
3. Install to Workspace; copy the Bot User OAuth Token (`xoxb-…`) into `SLACK_BOT_TOKEN`.
4. In Slack, invite the bot to the three grade channels (they are private, so this is required):
   `/invite @Attendance` in #ms-6th-gradeteam, #ms-7th-gradeteam, #ms-8th-gradeteam.
5. Teachers are found by their Slack account email, which must equal their address in `config/homerooms.json`. The admin page lists any that Slack does not know.

## 3. Gmail (service account sending as a shared mailbox)

1. Create the shared mailbox the app sends as, e.g. `attendance@kindleeducation.org` (a Workspace user or a group with "allow external senders" is fine; a user is simplest). Put it in `MAIL_FROM`.
2. Google Cloud Console → the school's project → APIs & Services → Enable **Gmail API**.
3. IAM & Admin → Service Accounts → Create (e.g. `attendance-mailer`). Keys → Add key → JSON. Encode it: `base64 -w0 key.json` and put the result in `GOOGLE_SA_JSON_B64`.
4. On the service account's details page, note the **Unique ID** (client id).
5. Google Admin console (a super-admin) → Security → Access and data control → API controls → **Domain-wide delegation** → Add new: the client id from step 4, scope `https://www.googleapis.com/auth/gmail.send`.
6. Replies to family and teacher emails go to the operations coordinator (`Reply-To`), so the shared mailbox needs no monitoring.

## 4. Admin sign-in (Google OAuth for the admin page)

1. Cloud Console → APIs & Services → Credentials → Create → OAuth client ID → Web application.
2. Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google` (add the final domain after the first deploy).
3. `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`; `AUTH_SECRET` from `npx auth secret`; `ALLOWED_EMAIL_DOMAIN=kindleeducation.org`.
   Consent screen type **Internal** keeps everyone outside the domain from signing in at all.

## 5. Vercel

1. Import `DJKindle007/attendance`; framework Next.js; root `/`.
2. Environment variables (Production, and Preview if wanted): everything in `.env.example` except the local-only ones. Start with `DRY_RUN=true`.
3. Deployment Protection must not block `/api/jobs/*` (Cloud Scheduler has no browser). On Hobby, protection is off by default; if you turn it on, add the bypass header to the scheduler jobs.
4. The job routes set `maxDuration = 60`, the Hobby limit.
5. The Hobby plan builds only commits authored by the project owner (same rule as the dashboard repos).

## 6. Cloud Scheduler

In the school's GCP project, enable Cloud Scheduler and create five HTTP jobs. Time zone **America/New_York** for all of them. Method POST, header `Authorization: Bearer <JOBS_SECRET>`, body `{}`, retry 1, attempt deadline 60s.

| Job | Cron | URL |
| --- | --- | --- |
| refresh-roster | `30 6 * * 1-5` | `https://<app>/api/jobs/refresh-roster` |
| remind-teachers | `10 9 * * 1-5` | `https://<app>/api/jobs/remind-teachers` |
| escalate-teachers | `20 9 * * 1-5` | `https://<app>/api/jobs/escalate-teachers` |
| email-absent-parents | `0 10 * * 1-5` | `https://<app>/api/jobs/email-absent-parents` |
| tardy-report | `30 15 * * 1-5` | `https://<app>/api/jobs/tardy-report` |

Adjust the three morning times after Phase 0 shows when OnCourse data lands in DeansList. The app itself skips weekends and the days off in `lib/time.ts`, so the cron can stay on weekdays.

With gcloud:

```bash
gcloud scheduler jobs create http attendance-remind-teachers \
  --location us-east1 --schedule "10 9 * * 1-5" --time-zone America/New_York \
  --uri https://<app>/api/jobs/remind-teachers --http-method POST \
  --headers "Authorization=Bearer <JOBS_SECRET>,Content-Type=application/json" --message-body '{}' \
  --attempt-deadline 60s --max-retry-attempts 1
```

## 7. Config file

`config/homerooms.json`: one entry per homeroom with its grade and the teacher email(s), the three grade channel ids, the operations coordinator's email, the school name and the deadline text. Change it with a pull request; the app validates it on start and `npm run check` validates it in CI.

## 8. Kiosk

1. Admin page → Setup → **Pair a kiosk**; name the device. A link appears once.
2. Open that link on the iPad in Safari; it sets a one-year cookie and shows the kiosk.
3. Put the iPad in Guided Access so students stay on the page. Revoke a lost device from the same panel.

## 9. Going live

1. Deploy with `DRY_RUN=true`. Run `refresh-roster` from the admin page; check the student count and that no homeroom is reported missing from config.
2. Run `discover` for a few mornings (Phase 0 in the README) and set the scheduler times.
3. Pair the kiosk; check a test student in and confirm the late pass appears in the DRY RUN log (Vercel → Logs).
4. Set `DRY_RUN=false`, redeploy, and watch one job at a time with the operations coordinator in Slack.

## Guardian emails from OnCourse

If Phase 0 shows DeansList has no guardian emails, export a CSV from OnCourse with a Local ID column and one or more email columns and upload it on the admin page (Setup → Guardian emails). Uploaded rows win over DeansList for those students. Repeat when contacts change.
