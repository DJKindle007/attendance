/**
 * Slack bot calls. In DRY_RUN every call logs what it would do and returns a
 * fake id, so the whole pipeline can run without a token.
 *
 * Scopes: chat:write, files:write, users:read, users:read.email, im:write.
 * The bot must be invited to the grade channels (they are private).
 */
import 'server-only';
import { WebClient } from '@slack/web-api';
import { isDryRun } from './config';

let client: WebClient | null = null;

function slack(): WebClient {
  if (!client) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error('SLACK_BOT_TOKEN is not set.');
    client = new WebClient(token);
  }
  return client;
}

export interface SlackResult {
  ok: boolean;
  channel?: string;
  ts?: string;
  error?: string;
  dryRun?: boolean;
}

function log(kind: string, detail: Record<string, unknown>) {
  console.log(`[DRY_RUN slack ${kind}]`, JSON.stringify(detail));
}

/** Slack user id for a work email, or null with an error message when Slack has no such user. */
export async function lookupUserIdByEmail(email: string): Promise<{ id: string | null; error?: string }> {
  if (isDryRun() && !process.env.SLACK_BOT_TOKEN) return { id: `U_DRY_${email.split('@')[0]}` };
  try {
    const res = await slack().users.lookupByEmail({ email });
    return { id: res.user?.id ?? null, error: res.user?.id ? undefined : 'no user' };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/** Posts a message to a channel id (or a user id, which Slack treats as a DM). */
export async function postMessage(channel: string, text: string, blocks?: unknown[]): Promise<SlackResult> {
  if (isDryRun()) {
    log('post', { channel, text });
    return { ok: true, channel, ts: `dry.${Date.now()}`, dryRun: true };
  }
  try {
    const res = await slack().chat.postMessage({ channel, text, blocks: blocks as never, unfurl_links: false, unfurl_media: false });
    return { ok: Boolean(res.ok), channel: res.channel, ts: res.ts };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Direct message to a user id. */
export function dm(userId: string, text: string, blocks?: unknown[]): Promise<SlackResult> {
  return postMessage(userId, text, blocks);
}

export async function updateMessage(channel: string, ts: string, text: string): Promise<SlackResult> {
  if (isDryRun()) {
    log('update', { channel, ts, text });
    return { ok: true, channel, ts, dryRun: true };
  }
  try {
    const res = await slack().chat.update({ channel, ts, text, blocks: [] });
    return { ok: Boolean(res.ok), channel: res.channel, ts: res.ts };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Uploads a file into a user's DM. conversations.open gives the DM channel id that files.uploadV2 needs. */
export async function uploadFileToUser(userId: string, file: Buffer, filename: string, comment: string): Promise<SlackResult> {
  if (isDryRun()) {
    log('upload', { userId, filename, bytes: file.length, comment });
    return { ok: true, dryRun: true };
  }
  try {
    const open = await slack().conversations.open({ users: userId });
    const channelId = open.channel?.id;
    if (!channelId) return { ok: false, error: 'could not open DM' };
    await slack().files.uploadV2({ channel_id: channelId, file, filename, initial_comment: comment });
    return { ok: true, channel: channelId };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  return err instanceof Error ? err.message : String(err);
}
