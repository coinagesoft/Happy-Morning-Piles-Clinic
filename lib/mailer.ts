import { CLINIC } from './clinicInfo';
import nodemailer from 'nodemailer';

let cachedTransport: nodemailer.Transporter | null = null;

export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport(): nodemailer.Transporter {
  if (cachedTransport) return cachedTransport;
  const port = Number(process.env.SMTP_PORT || 465);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      // Gmail app passwords are often pasted with spaces
      pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    },
  });
  return cachedTransport;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendHtmlEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  if (!isMailerConfigured()) {
    throw new Error(
      'Email is not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password) in your environment.'
    );
  }
  const from =
    process.env.SMTP_FROM ||
    `"${CLINIC.name}" <${process.env.SMTP_USER}>`;
  await getTransport().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
    attachments: opts.attachments,
  });
}