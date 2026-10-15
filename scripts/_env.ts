/** Loads .env into process.env for scripts (tsx does not do this by itself). Existing variables win. */
import { readFileSync } from 'node:fs';

export function loadDotEnv(path = '.env'): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const hash = value.indexOf(' #');
    if (hash >= 0 && !/^["']/.test(value)) value = value.slice(0, hash).trim();
    value = value.replace(/^(["'])(.*)\1$/, '$2');
    if (!(key in process.env)) process.env[key] = value;
  }
}
