/**
 * Sends mail through the Gmail API as a shared mailbox, using a service
 * account with domain-wide delegation (scope gmail.send). In DRY_RUN the
 * message is logged instead.
 */
import 'server-only';
import { google } from 'googleapis';
import { isDryRun } from './config';
import type { EmailContent } from './email-templates';

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  dryRun?: boolean;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedKey: ServiceAccountKey | null = null;

function serviceAccount(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const b64 = process.env.GOOGLE_SA_JSON_B64;
  if (!b64) throw new Error('GOOGLE_SA_JSON_B64 is not set.');
  const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as Partial<ServiceAccountKey>;
  if (!parsed.client_email || !parsed.private_key) throw new Error('GOOGLE_SA_JSON_B64 does not hold a service account key.');
  cachedKey = { client_email: parsed.client_email, private_key: parsed.private_key };
  return cachedKey;
}

function sender(): string {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('MAIL_FROM is not set.');
  return from;
}

function gmailClient() {
  const key = serviceAccount();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: sender(), // the mailbox the service account acts as
  });
  return google.gmail({ version: 'v1', auth });
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Builds an RFC 2822 message with text and HTML parts. */
export function buildRawMessage(args: { from: string; to: string[]; cc?: string[]; replyTo?: string; content: EmailContent }): string {
  const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${args.from}`,
    `To: ${args.to.join(', ')}`,
    args.cc?.length ? `Cc: ${args.cc.join(', ')}` : '',
    args.replyTo ? `Reply-To: ${args.replyTo}` : '',
    `Subject: ${encodeHeader(args.content.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(args.content.text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(args.content.html, 'utf8').toString('base64'),
    `--${boundary}--`,
  ];
  const raw = `${headers.join('\r\n')}\r\n\r\n${body.join('\r\n')}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export async function sendMail(args: { to: string[]; cc?: string[]; replyTo?: string; content: EmailContent }): Promise<SendResult> {
  if (!args.to.length) return { ok: false, error: 'no recipient' };
  if (isDryRun()) {
    console.log('[DRY_RUN gmail send]', JSON.stringify({ to: args.to, cc: args.cc, subject: args.content.subject }));
    return { ok: true, id: `dry.${Date.now()}`, dryRun: true };
  }
  try {
    const raw = buildRawMessage({ from: sender(), to: args.to, cc: args.cc, replyTo: args.replyTo, content: args.content });
    const res = await gmailClient().users.messages.send({ userId: 'me', requestBody: { raw } });
    return { ok: true, id: res.data.id ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
