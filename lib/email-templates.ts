/**
 * The three emails the app sends. Wording is school policy: edit here. Every
 * template returns plain text and a simple HTML version of the same words.
 */
import { formatLongDate } from './time';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paragraphs(lines: string[]): EmailContent['html'] {
  return lines.map((l) => `<p style="margin:0 0 12px 0;font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:1.5;color:#33383a">${escapeHtml(l)}</p>`).join('\n');
}

function wrap(body: string, schoolName: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#faf9f5"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e3dc;border-radius:10px;padding:24px">${body}<p style="margin:24px 0 0 0;font-family:Montserrat,Arial,sans-serif;font-size:12px;color:#6d7375">${escapeHtml(schoolName)} · Attendance</p></div></body></html>`;
}

export function teacherWarning(args: { teacherName: string; homeroom: string; dateKey: string; deadline: string; schoolName: string; opsEmail: string }): EmailContent {
  const date = formatLongDate(args.dateKey);
  const lines = [
    `Hi ${args.teacherName},`,
    `Daily attendance for homeroom ${args.homeroom} has not been submitted in OnCourse for ${date}. Attendance is due by ${args.deadline}.`,
    `Please submit it now. Until it is in, the office cannot tell which of your students are absent, and families of absent students are not being notified.`,
    `This message is sent automatically when attendance is still missing after the reminder on Slack. If you already submitted it, it may not have synced yet; reply to this email and the operations coordinator (${args.opsEmail}) will check.`,
    `Thank you.`,
  ];
  return {
    subject: `Attendance not submitted: ${args.homeroom}, ${date}`,
    text: lines.join('\n\n'),
    html: wrap(paragraphs(lines), args.schoolName),
  };
}

export function parentAbsence(args: { studentName: string; dateKey: string; schoolName: string; opsEmail: string }): EmailContent {
  const date = formatLongDate(args.dateKey);
  const lines = [
    `Hello,`,
    `This is a message from ${args.schoolName}. ${args.studentName} was marked absent from school today, ${date}.`,
    `If ${args.studentName} is out sick or absent for another reason, please reply to this email or contact the main office at ${args.opsEmail} so the absence can be excused.`,
    `If ${args.studentName} arrives later today, you will receive a follow-up message with the arrival time.`,
    `Thank you.`,
  ];
  return {
    subject: `${args.studentName} was marked absent today (${date})`,
    text: lines.join('\n\n'),
    html: wrap(paragraphs(lines), args.schoolName),
  };
}

export function parentReversal(args: { studentName: string; dateKey: string; arrivedAt: string; schoolName: string; opsEmail: string }): EmailContent {
  const date = formatLongDate(args.dateKey);
  const lines = [
    `Hello,`,
    `Good news from ${args.schoolName}: ${args.studentName} arrived at school at ${args.arrivedAt} today, ${date}, and is in class.`,
    `You received an earlier message saying ${args.studentName} was absent. That record will be corrected to a late arrival (tardy).`,
    `Questions? Reply to this email or contact the main office at ${args.opsEmail}.`,
    `Thank you.`,
  ];
  return {
    subject: `${args.studentName} arrived at ${args.arrivedAt} today (${date})`,
    text: lines.join('\n\n'),
    html: wrap(paragraphs(lines), args.schoolName),
  };
}
