import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import { sendHtmlEmail, isMailerConfigured } from './mailer';
import { isMsg91Configured, isMsg91FollowUpConfigured, sendMsg91WhatsApp } from './msg91';
import { formatSlotLabel } from './slots';
import {
  patientReminderEmail,
  followUpReminderEmail,
  doctorDigestEmail,
  formatDateLong,
  modeLabel,
  locationDetail,
  type ReminderAppointment,
} from './reminderEmails';
import { CLINIC } from './clinicInfo';
import { getAppUrl } from './appUrl';

/**
 * Appointment reminders (all times Asia/Kolkata):
 *  - Patient: email + WhatsApp (MSG91) at 2 days, 1 day, 10 hours, 1 hour and 10 minutes
 *    before the appointment (REMINDER_OFFSETS_MINUTES, default "2880,1440,600,60,10")
 *  - Follow-up: if the doctor set a follow-up date on a prescription, the patient gets an email
 *    (+ WhatsApp via the MSG91 follow-up template only when FOLLOWUP_WHATSAPP_ENABLED=true) the day before and on the day (FOLLOWUP_REMINDER_DAYS_BEFORE,
 *    default "1,0"), sent from FOLLOWUP_REMINDER_HOUR (default 9 AM IST). Skipped if the patient
 *    has already booked a new appointment.
 *  - Doctor : one email each morning with the whole day's list (DOCTOR_DIGEST_HOUR, default 8)
 *
 * runReminderJob() is idempotent: every message is recorded in `reminder_log`,
 * so calling it every minute (or from two places) never sends twice.
 */

const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MS = 10 * 60 * 1000;
const DIGEST_LAST_HOUR = 18; // don't send a "morning" digest after 6 PM
const FOLLOWUP_LAST_HOUR = 20; // don't send follow-up reminders after 8 PM

type Kind = `before_${number}` | `followup_${number}` | 'doctor_digest' | 'test_after_booking';
type Channel = 'email' | 'whatsapp';

export interface JobItem {
  kind: Kind;
  channel: Channel;
  to: string;
  appointmentId?: string;
  result: 'sent' | 'failed' | 'would_send' | 'already_done';
  error?: string;
}

export interface JobResult {
  ranAtIst: string;
  dryRun: boolean;
  sent: number;
  failed: number;
  skipped: string[];
  items: JobItem[];
}

declare global {
  // eslint-disable-next-line no-var
  var __reminderRunning: boolean | undefined;
  // eslint-disable-next-line no-var
  var __reminderTimer: ReturnType<typeof setInterval> | undefined;
  // eslint-disable-next-line no-var
  var __reminderSchema: boolean | undefined;
}

function config() {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
  };
  const offsets = (process.env.REMINDER_OFFSETS_MINUTES || '2880,1440,600,60,10')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((x, y) => y - x);
  const followUpDays = (process.env.FOLLOWUP_REMINDER_DAYS_BEFORE || '1,0')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 30)
    .sort((x, y) => y - x);
  return {
    offsets,
    followUpDays: followUpDays.length ? followUpDays : [1, 0],
    followUpHour: num(process.env.FOLLOWUP_REMINDER_HOUR, 9),
    // Long-lead reminders (10 hours or more) are held back during these IST hours. Same value = no quiet hours.
    quietStart: num(process.env.REMINDER_QUIET_START_HOUR, 22),
    quietEnd: num(process.env.REMINDER_QUIET_END_HOUR, 7),
    digestHour: num(process.env.DOCTOR_DIGEST_HOUR, 8),
    // TESTING ONLY: send a reminder this many minutes after an appointment is booked (0 = off)
    testAfterBookingMin: num(process.env.REMINDER_TEST_AFTER_BOOKING_MINUTES, 0),
    checkMinutes: Math.max(1, num(process.env.REMINDER_CHECK_MINUTES, 1)),
    doctorEmail: process.env.DOCTOR_DIGEST_EMAIL || process.env.DOCTOR_EMAIL || '',
  };
}

function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/* ------------------------------- IST helpers ------------------------------- */

function istParts(d: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/* --------------------------------- schema --------------------------------- */

async function ensureReminderSchema(): Promise<void> {
  if (global.__reminderSchema) return;
  await ensureDatabaseSchema();
  await getPool().execute(`
    CREATE TABLE IF NOT EXISTS reminder_log (
      ref_key VARCHAR(190) PRIMARY KEY,
      appointment_id VARCHAR(64) NULL,
      kind VARCHAR(32) NOT NULL,
      channel VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL,
      attempts INT NOT NULL DEFAULT 1,
      error TEXT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_rl_appt (appointment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  global.__reminderSchema = true;
}

/** Returns true if this run owns the right to send (first attempt, retry after failure, or stale claim). */
async function claim(key: string, kind: Kind, channel: Channel, apptId?: string): Promise<boolean> {
  const pool = getPool();
  const now = new Date().toISOString();
  const [ins] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO reminder_log
       (ref_key, appointment_id, kind, channel, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'sending', 1, ?, ?)`,
    [key, apptId ?? null, kind, channel, now, now]
  );
  if (ins.affectedRows === 1) return true;

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const [upd] = await pool.execute<ResultSetHeader>(
    `UPDATE reminder_log
        SET status = 'sending', attempts = attempts + 1, updated_at = ?
      WHERE ref_key = ? AND attempts < ?
        AND (status = 'failed' OR (status = 'sending' AND updated_at < ?))`,
    [now, key, MAX_ATTEMPTS, staleBefore]
  );
  return upd.affectedRows === 1;
}

async function finish(key: string, ok: boolean, error?: string): Promise<void> {
  await getPool().execute(
    `UPDATE reminder_log SET status = ?, error = ?, updated_at = ? WHERE ref_key = ?`,
    [ok ? 'sent' : 'failed', ok ? null : (error || 'unknown error').slice(0, 500), new Date().toISOString(), key]
  );
}

/* ------------------------------ data loading ------------------------------ */

interface ApptRow extends RowDataPacket {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  age: number;
  reason: string;
  appointment_date: string;
  appointment_time: string;
  meet_link: string | null;
  consultation_type: string | null;
  created_at: string;
}

async function loadConfirmed(dates: string[]): Promise<ReminderAppointment[]> {
  const [rows] = await getPool().execute<ApptRow[]>(
    `SELECT id, full_name, phone, email, age, reason, appointment_date, appointment_time,
            meet_link, consultation_type, created_at
       FROM appointments
      WHERE status = 'confirmed' AND appointment_date IN (${dates.map(() => '?').join(',')})
      ORDER BY appointment_date, appointment_time`,
    dates
  );
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    age: r.age,
    reason: r.reason,
    date: r.appointment_date,
    time: r.appointment_time,
    meetLink: r.meet_link || undefined,
    consultationType: r.consultation_type === 'offline' ? 'offline' : 'online',
    createdAt: r.created_at,
  }));
}

interface FollowUpRow extends RowDataPacket {
  id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  prescription_date: string;
  follow_up_date: string;
}

async function loadFollowUps(dates: string[]): Promise<FollowUpRow[]> {
  const [rows] = await getPool().execute<FollowUpRow[]>(
    `SELECT id, patient_name, patient_email, patient_phone, prescription_date, follow_up_date
       FROM prescriptions
      WHERE follow_up_date IN (${dates.map(() => '?').join(',')})
      ORDER BY follow_up_date`,
    dates
  );
  return rows;
}

/** True if this patient already has a confirmed appointment booked after the prescription (nothing to remind). */
async function hasBookedSince(phone: string, prescriptionDate: string, today: string): Promise<boolean> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `SELECT 1 FROM appointments
      WHERE phone = ? AND status = 'confirmed'
        AND appointment_date > ? AND appointment_date >= ?
      LIMIT 1`,
    [phone, prescriptionDate, today]
  );
  return rows.length > 0;
}

/* --------------------------------- the job --------------------------------- */

interface Task {
  key: string;
  kind: Kind;
  channel: Channel;
  to: string;
  appointmentId?: string;
  run: () => Promise<void>;
}

/**
 * @param opts.dryRun  list what would be sent, send nothing, write nothing
 * @param opts.at      pretend "now" is this IST time, e.g. "2026-10-23T18:05" (only meaningful with dryRun)
 */
export async function runReminderJob(
  opts: { dryRun?: boolean; at?: string } = {}
): Promise<JobResult> {
  if (global.__reminderRunning) {
    return { ranAtIst: '', dryRun: !!opts.dryRun, sent: 0, failed: 0, skipped: ['previous run still in progress'], items: [] };
  }
  global.__reminderRunning = true;
  try {
    await ensureReminderSchema();
    const cfg = config();
    const dryRun = !!opts.dryRun;

    const nowInstant =
      opts.at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(opts.at)
        ? new Date(`${opts.at}:00+05:30`)
        : new Date();
    const { date: today, minutes: nowMin } = istParts(nowInstant);
    const tomorrow = addDays(today, 1);
    const nowHour = Math.floor(nowMin / 60);

    const mailOk = isMailerConfigured();
    const waOk = isMsg91Configured();
    const skipped: string[] = [];
    if (!mailOk) skipped.push('email not configured (SMTP_USER / SMTP_PASS)');
    if (!waOk) skipped.push('WhatsApp not configured (MSG91_* env vars)');

    const appts = await loadConfirmed([today, tomorrow, addDays(today, 2), addDays(today, 3)]);
    const tasks: Task[] = [];
    const quiet = inQuietHours(nowHour, cfg.quietStart, cfg.quietEnd);

    const dayWordFor = (date: string) =>
      date === today ? 'today' : date === tomorrow ? 'tomorrow' : date === addDays(today, 2) ? 'in 2 days' : `on ${formatDateLong(date)}`;

    for (const a of appts) {
      const apptInstant = new Date(`${a.date}T${a.time}:00+05:30`).getTime();
      const minsUntil = Math.floor((apptInstant - nowInstant.getTime()) / 60_000);
      const bookedMsAgo = nowInstant.getTime() - Date.parse(a.createdAt);
      const bookedMinsBefore = (apptInstant - Date.parse(a.createdAt)) / 60_000;

      let when: Kind | null = null;
      let lead = 0;

      if (
        cfg.testAfterBookingMin > 0 &&
        bookedMsAgo >= cfg.testAfterBookingMin * 60_000 &&
        bookedMsAgo <= 60 * 60_000
      ) {
        when = 'test_after_booking';
        lead = a.date === today ? 60 : 1440;
      } else if (minsUntil > 0) {
        // Only the NEXT stage that is due fires (so after downtime you get one message, not five).
        const due = cfg.offsets.filter((o) => minsUntil <= o);
        if (due.length) {
          lead = Math.min(...due);
          const bookedAfterStage = bookedMinsBefore <= lead; // booking confirmation was already sent after this stage's time
          const heldForNight = lead >= 600 && quiet;
          if (!bookedAfterStage && !heldForNight) when = `before_${lead}`;
        }
      }
      if (!when) continue;

      if (mailOk && a.email) {
        const mail = patientReminderEmail(a, lead, dayWordFor(a.date));
        if (when === 'test_after_booking') mail.subject = `[TEST] ${mail.subject}`;
        tasks.push({
          key: `${a.id}:${when}:email`,
          kind: when,
          channel: 'email',
          to: a.email,
          appointmentId: a.id,
          run: () => sendHtmlEmail({ to: a.email, ...mail }),
        });
      }
      if (waOk) {
        tasks.push({
          key: `${a.id}:${when}:whatsapp`,
          kind: when,
          channel: 'whatsapp',
          to: a.phone,
          appointmentId: a.id,
          run: () =>
            sendMsg91WhatsApp({
              phone: a.phone,
              // {{1}} name, {{2}} date, {{3}} time, {{4}} consultation type, {{5}} link / address
              bodyValues: [a.fullName, formatDateLong(a.date), formatSlotLabel(a.time), modeLabel(a), locationDetail(a)],
            }),
        });
      }
    }

    // Follow-up reminders (date chosen by the doctor in the prescription)
    if (nowHour >= cfg.followUpHour && nowHour < FOLLOWUP_LAST_HOUR) {
      const days = cfg.followUpDays.map((n) => ({ n, date: addDays(today, n) }));
      const dueFollowUps = await loadFollowUps(days.map((d) => d.date));
      const appUrl = getAppUrl();
      const bookingUrl = appUrl ? `${appUrl}/appointment` : '';
      // Email only for now. WhatsApp follow-up reminders stay off until FOLLOWUP_WHATSAPP_ENABLED=true.
      const waFollowUpWanted = (process.env.FOLLOWUP_WHATSAPP_ENABLED || '').toLowerCase() === 'true';
      const waFollowUpOk = waFollowUpWanted && isMsg91FollowUpConfigured();
      if (dueFollowUps.length && waFollowUpWanted && !waFollowUpOk) {
        skipped.push('follow-up WhatsApp not configured (MSG91_WHATSAPP_TEMPLATE_FOLLOWUP)');
      }

      for (const rx of dueFollowUps) {
        if (rx.follow_up_date <= rx.prescription_date) continue;
        if (today <= rx.prescription_date) continue; // patient has just left the clinic - remind from the next day
        const stage = days.find((d) => d.date === rx.follow_up_date);
        if (!stage) continue;
        if (await hasBookedSince(rx.patient_phone, rx.prescription_date, today)) continue;

        const kind: Kind = `followup_${stage.n}`;
        const keyBase = `rx:${rx.id}:${rx.follow_up_date}:${kind}`;
        const realEmail = rx.patient_email && rx.patient_email !== 'patient@walkin.clinic' && rx.patient_email.includes('@');

        if (mailOk && realEmail) {
          const mail = followUpReminderEmail({
            fullName: rx.patient_name,
            followUpDate: rx.follow_up_date,
            daysBefore: stage.n,
            bookingUrl: bookingUrl || undefined,
          });
          tasks.push({
            key: `${keyBase}:email`,
            kind,
            channel: 'email',
            to: rx.patient_email,
            run: () => sendHtmlEmail({ to: rx.patient_email, ...mail }),
          });
        }
        if (waFollowUpOk) {
          tasks.push({
            key: `${keyBase}:whatsapp`,
            kind,
            channel: 'whatsapp',
            to: rx.patient_phone,
            run: () =>
              sendMsg91WhatsApp({
                phone: rx.patient_phone,
                template: process.env.MSG91_WHATSAPP_TEMPLATE_FOLLOWUP,
                // {{1}} name, {{2}} follow-up date, {{3}} booking link (or clinic phone), {{4}} clinic phone
                bodyValues: [
                  rx.patient_name,
                  formatDateLong(rx.follow_up_date),
                  bookingUrl || CLINIC.phone.display,
                  CLINIC.phone.display,
                ],
              }),
          });
        }
      }
    }

    // Doctor's morning digest
    if (nowHour >= cfg.digestHour && nowHour < DIGEST_LAST_HOUR) {
      if (!cfg.doctorEmail) {
        skipped.push('doctor digest: set DOCTOR_EMAIL (or DOCTOR_DIGEST_EMAIL)');
      } else if (mailOk) {
        const mail = doctorDigestEmail(today, appts.filter((a) => a.date === today));
        tasks.push({
          key: `doctor_digest:${today}:email`,
          kind: 'doctor_digest',
          channel: 'email',
          to: cfg.doctorEmail,
          run: () => sendHtmlEmail({ to: cfg.doctorEmail, ...mail }),
        });
      }
    }

    const items: JobItem[] = [];
    let sent = 0;
    let failed = 0;

    for (const t of tasks) {
      const base = { kind: t.kind, channel: t.channel, to: t.to, appointmentId: t.appointmentId };

      if (dryRun) {
        const [rows] = await getPool().execute<RowDataPacket[]>(
          'SELECT status FROM reminder_log WHERE ref_key = ?',
          [t.key]
        );
        items.push({ ...base, result: rows[0]?.status === 'sent' ? 'already_done' : 'would_send' });
        continue;
      }

      if (!(await claim(t.key, t.kind, t.channel, t.appointmentId))) {
        continue; // already sent, being sent, or out of retries
      }
      try {
        await t.run();
        await finish(t.key, true);
        sent++;
        items.push({ ...base, result: 'sent' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await finish(t.key, false, msg);
        failed++;
        items.push({ ...base, result: 'failed', error: msg });
        console.error(`[reminders] ${t.kind}/${t.channel} to ${t.to} failed:`, msg);
      }
    }

    return {
      ranAtIst: `${today} ${String(nowHour).padStart(2, '0')}:${String(nowMin % 60).padStart(2, '0')}`,
      dryRun,
      sent,
      failed,
      skipped,
      items,
    };
  } finally {
    global.__reminderRunning = false;
  }
}

/** In-process scheduler for a long-running Node server (VPS / `npm start`). Safe to call repeatedly. */
export function startReminderScheduler(): void {
  if (global.__reminderTimer) return;
  const tick = async () => {
    try {
      const r = await runReminderJob();
      if (r.sent || r.failed) {
        console.log(`[reminders] ${r.ranAtIst} IST sent=${r.sent} failed=${r.failed}`);
      }
    } catch (err) {
      console.error('[reminders] run failed:', err);
    }
  };
  const every = config().checkMinutes;
  global.__reminderTimer = setInterval(tick, every * 60 * 1000);
  setTimeout(tick, 30_000);
  console.log(`[reminders] scheduler started for ${CLINIC.name} (every ${every} min, reminders at ${config().offsets.join('/')} min before)`);
}