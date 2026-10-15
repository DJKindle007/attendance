/**
 * Environment and school configuration, validated once with zod.
 *
 * config/homerooms.json holds the things that change per year: which teacher
 * owns each homeroom, the grade-level Slack channels and the operations
 * coordinator. Secrets stay in the environment (.env locally, Vercel in
 * production).
 */
import { z } from 'zod';
import homeroomsJson from '@/config/homerooms.json';

const HomeroomSchema = z.object({
  grade: z.string().min(1),
  teachers: z.array(z.string().email()).min(1),
});

export const SchoolConfigSchema = z.object({
  schoolName: z.string().min(1),
  /** Shown in reminders: when attendance is due in OnCourse. */
  attendanceDeadline: z.string().min(1).default('9:10 AM'),
  opsCoordinatorEmail: z.string().email(),
  gradeChannels: z.record(z.string(), z.string().regex(/^[CG][A-Z0-9]+$/)),
  homerooms: z.record(z.string(), HomeroomSchema),
  /** Display names for staff emails, used in greetings. Anyone missing is named from the email's local part. */
  staffNames: z.record(z.string().email(), z.string().min(1)).default({}),
});

export type SchoolConfig = z.infer<typeof SchoolConfigSchema>;
export type HomeroomConfig = z.infer<typeof HomeroomSchema>;

let cachedSchool: SchoolConfig | null = null;

export function schoolConfig(): SchoolConfig {
  if (!cachedSchool) cachedSchool = SchoolConfigSchema.parse(homeroomsJson);
  return cachedSchool;
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  JOBS_SECRET: z.string().min(1).optional(),
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => (v ?? 'true').toLowerCase() !== 'false'),
  TZ_NAME: z.string().min(1).default('America/New_York'),
  HOMEROOM_SUBMITTED_MIN_RATIO: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v ?? '0.5');
      return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.5;
    }),
  SLACK_BOT_TOKEN: z.string().optional(),
  GOOGLE_SA_JSON_B64: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),
  APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function env(): Env {
  // Vercel and shells can leave a variable set to an empty string; treat that as unset.
  if (!cachedEnv) cachedEnv = EnvSchema.parse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));
  return cachedEnv;
}

/** True when every outbound message should be logged instead of sent. Defaults to true so a fresh deploy is silent. */
export function isDryRun(): boolean {
  return env().DRY_RUN;
}
