import 'server-only';
import { discoverJob } from './discover';
import { emailAbsentParents } from './email-absent-parents';
import { escalateTeachers } from './escalate-teachers';
import { refreshRoster } from './refresh-roster';
import { remindTeachers } from './remind-teachers';
import type { JobFn } from './run';
import { tardyReport } from './tardy-report';

export const JOBS: Record<string, { fn: JobFn; description: string; schedule: string }> = {
  'refresh-roster': { fn: refreshRoster, description: 'Refresh the roster cache and staff Slack ids from DeansList', schedule: '6:30 AM' },
  'remind-teachers': { fn: remindTeachers, description: 'Slack reminder to teachers whose homeroom is not submitted', schedule: '9:10 AM' },
  'escalate-teachers': { fn: escalateTeachers, description: 'Warning email to teachers still missing; list to the ops coordinator', schedule: '9:20 AM' },
  'email-absent-parents': { fn: emailAbsentParents, description: 'Absence email to guardians; reversal sweep', schedule: '10:00 AM' },
  'tardy-report': { fn: tardyReport, description: 'Spreadsheet of late arrivals to the ops coordinator', schedule: '3:30 PM' },
  discover: { fn: discoverJob, description: 'Phase 0: what DeansList returns (field names and counts only)', schedule: 'manual' },
};

export const JOB_NAMES = Object.keys(JOBS);
