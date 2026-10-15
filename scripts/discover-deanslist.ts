/**
 * Phase 0 discovery. Prints what DeansList returns for this school: field
 * names, counts, rows per homeroom and codes seen. Never prints a student's
 * values. Run it at about 8:45, 9:05, 9:15 and 9:30 on a few school days:
 *
 *   npm run discover            # today
 *   npm run discover -- 2026-10-14
 */
import { loadDotEnv } from './_env';
loadDotEnv();

import { requireDeansListConfig } from '../lib/deanslist/client';
import { discover, formatDiscovery } from '../lib/deanslist/discover';
import { todayKey } from '../lib/time';

async function main() {
  const dateKey = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : todayKey();
  const config = requireDeansListConfig();
  const report = await discover(config, dateKey);
  console.log(formatDiscovery(report));
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
