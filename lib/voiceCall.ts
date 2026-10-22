import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import { getAppointmentById, updateAppointment, type Appointment } from './storage';
import { CLINIC } from './clinicInfo';

/**
 * AI voice CONFIRMATION call (only) - placed automatically after an appointment is booked.
 * Provider: Vapi (https://vapi.ai). The call is made with a transient assistant built here,
 * so nothing needs to be configured in the Vapi dashboard except an API key and a phone number.
 *
 * Needs a long-running Node server (same as the WhatsApp feature) for the quiet-hours sweeper.
 */

export type CallStatus = 'pending' | 'calling' | 'completed' | 'failed' | 'skipped';
export type CallOutcome =
  | 'confirmed'
  | 'declined'
  | 'reschedule_requested'
  | 'no_answer'
  | 'unclear';

export interface CallLog {
  id: number;
  appointmentId: string;
  vapiCallId: string | null;
  status: CallStatus;
  outcome: CallOutcome | null;
  endedReason: string | null;
  summary: string | null;
  transcript: string | null;
  error: string | null;
  triggerSource: string;
  createdAt: string;
  updatedAt: string;
}

interface CallLogRow extends RowDataPacket {
  id: number;
  appointment_id: string;
  vapi_call_id: string | null;
  status: CallStatus;
  outcome: CallOutcome | null;
  ended_reason: string | null;
  summary: string | null;
  transcript: string | null;
  error: string | null;
  trigger_source: string;
  created_at: string;
  updated_at: string;
}

function mapRow(r: CallLogRow): CallLog {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    vapiCallId: r.vapi_call_id,
    status: r.status,
    outcome: r.outcome,
    endedReason: r.ended_reason,
    summary: r.summary,
    transcript: r.transcript,
    error: r.error,
    triggerSource: r.trigger_source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* ------------------------------ configuration ------------------------------ */

export function voiceCallsEnabled(): boolean {
  return (
    (process.env.VOICE_CALLS_ENABLED || '').toLowerCase() === 'true' &&
    Boolean(process.env.VAPI_API_KEY) &&
    Boolean(process.env.VAPI_PHONE_NUMBER_ID)
  );
}

/** Calls are only placed inside this IST window (default 9 AM - 9 PM). Others are queued. */
function callWindow(): { start: number; end: number } {
  const start = Number(process.env.VOICE_CALL_START_HOUR ?? 9);
  const end = Number(process.env.VOICE_CALL_END_HOUR ?? 21);
  return {
    start: Number.isFinite(start) ? start : 9,
    end: Number.isFinite(end) ? end : 21,
  };
}

function istHourNow(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return Number(h) % 24;
}

export function isWithinCallWindow(): boolean {
  const { start, end } = callWindow();
  const h = istHourNow();
  return h >= start && h < end;
}

function toE164India(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return `+91${digits.slice(-10)}`;
}

function speakDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function speakTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/* ------------------------------ call_logs helpers ------------------------------ */

async function insertLog(
  appointmentId: string,
  status: CallStatus,
  source: string,
  error?: string
): Promise<number> {
  await ensureDatabaseSchema();
  const now = new Date().toISOString();
  const [res] = await getPool().execute<ResultSetHeader>(
    `INSERT INTO call_logs (appointment_id, status, trigger_source, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [appointmentId, status, source, error || null, now, now]
  );
  return res.insertId;
}

async function patchLog(
  id: number,
  fields: Partial<{
    status: CallStatus;
    vapi_call_id: string;
    outcome: CallOutcome;
    ended_reason: string;
    summary: string;
    transcript: string;
    error: string;
  }>
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;
  const setSql = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k] ?? null);
  await getPool().execute(
    `UPDATE call_logs SET ${setSql}, updated_at = ? WHERE id = ?`,
    [...values, new Date().toISOString(), id]
  );
}

export async function getCallLogsForAppointment(appointmentId: string): Promise<CallLog[]> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<CallLogRow[]>(
    `SELECT * FROM call_logs WHERE appointment_id = ? ORDER BY id DESC`,
    [appointmentId]
  );
  return rows.map(mapRow);
}

async function hasActiveOrDoneCall(appointmentId: string): Promise<boolean> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `SELECT id FROM call_logs
     WHERE appointment_id = ? AND status IN ('pending', 'calling', 'completed') LIMIT 1`,
    [appointmentId]
  );
  return rows.length > 0;
}

/* ------------------------------ Vapi assistant ------------------------------ */

function buildAssistant(appt: Appointment) {
  const doctor = CLINIC.doctor.name;
  const when = `${speakDate(appt.date)} at ${speakTime(appt.time)}`;
  const isOffline = appt.consultationType === 'offline';
  const mode = isOffline
    ? `an in-clinic visit at ${CLINIC.address.full}`
    : 'an online video consultation on Google Meet (the link is already sent to the patient on email)';

  const systemPrompt = `You are the friendly appointment assistant of ${CLINIC.name}, calling on behalf of ${doctor}.
You are making a short outbound CONFIRMATION call. This is your ONLY job.

APPOINTMENT DETAILS
- Patient name: ${appt.fullName}
- Date & time: ${when} (India time)
- Type: ${mode}
- Clinic phone: ${CLINIC.phone.display}

CALL FLOW
1. The first message already greeted and asked if you are speaking with ${appt.fullName}. Wait for the answer.
2. If it is NOT the patient or a family member, politely say you will call later and end the call. Share no details.
3. Tell them their consultation with ${doctor} is booked for ${when}, ${isOffline ? 'at the clinic' : 'online on Google Meet'}.
4. Ask: "Is this time fine for you / will you be able to attend?"
5. If YES: thank them, tell them to carry any old reports, and end the call.
6. If they want to CHANGE or CANCEL: do NOT reschedule yourself. Say the clinic team will contact them shortly, or they can call ${CLINIC.phone.display}. Then end the call.
7. Then end the call politely. Keep the whole call under 1 minute.

RULES
- Speak in simple HINDI by default. If the person replies in Marathi or English, switch to that language.
- Short sentences, one question at a time, warm and polite. Use "ji" respectfully.
- NEVER mention the patient's medical condition, symptoms or reason for visit. Only say "consultation".
- NEVER give medical advice, prices or diagnosis. If asked, say the doctor will explain during the consultation.
- NEVER invent details beyond what is written above.
- If it sounds like voicemail / an answering machine, end the call without leaving any details.`;

  const firstMessage = `नमस्कार, मैं ${CLINIC.shortName} क्लिनिक से बोल रही हूँ। क्या मेरी बात ${appt.fullName} जी से हो रही है?`;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const webhookOk = /^https:\/\//i.test(appUrl);
  if (!webhookOk) {
    console.warn(
      '[voice] NEXT_PUBLIC_APP_URL is not a public https URL - call results will NOT be reported back. Use your domain or an ngrok URL.'
    );
  }

  return {
    name: 'Appointment Confirmation',
    firstMessage,
    firstMessageMode: 'assistant-speaks-first',
    maxDurationSeconds: 120,
    silenceTimeoutSeconds: 20,
    endCallFunctionEnabled: true,
    model: {
      provider: process.env.VOICE_LLM_PROVIDER || 'openai',
      model: process.env.VOICE_LLM_MODEL || 'gpt-4o-mini',
      temperature: 0.3,
      messages: [{ role: 'system', content: systemPrompt }],
    },
    voice: {
      provider: process.env.VOICE_PROVIDER || 'azure',
      voiceId: process.env.VOICE_ID || 'hi-IN-SwaraNeural',
    },
    transcriber: {
      provider: process.env.VOICE_TRANSCRIBER_PROVIDER || 'deepgram',
      model: process.env.VOICE_TRANSCRIBER_MODEL || 'nova-3',
      language: process.env.VOICE_TRANSCRIBER_LANGUAGE || 'multi',
    },
    analysisPlan: {
      summaryPlan: { enabled: true },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            outcome: {
              type: 'string',
              enum: ['confirmed', 'declined', 'reschedule_requested', 'no_answer', 'unclear'],
              description:
                'confirmed = patient agreed to attend; declined = patient will not come / wants to cancel; reschedule_requested = wants another date/time; no_answer = nobody spoke / voicemail; unclear = anything else.',
            },
            patientNote: {
              type: 'string',
              description: 'Short note of anything the patient asked (max 1 sentence).',
            },
          },
          required: ['outcome'],
        },
      },
    },
    ...(webhookOk
      ? {
          server: {
            url: `${appUrl}/api/voice/webhook`,
            secret: process.env.VAPI_WEBHOOK_SECRET,
          },
          serverMessages: ['end-of-call-report'],
        }
      : {}),
  };
}

/* ------------------------------ placing the call ------------------------------ */

async function dispatchCall(appt: Appointment, logId: number): Promise<void> {
  try {
    const res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: { number: toE164India(appt.phone), name: appt.fullName },
        assistant: buildAssistant(appt),
        metadata: { appointmentId: appt.id, callLogId: logId },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      await patchLog(logId, { status: 'failed', error: `Vapi ${res.status}: ${text.slice(0, 500)}` });
      return;
    }

    let callId = '';
    try {
      callId = JSON.parse(text).id || '';
    } catch {
      // ignore - id stays empty
    }
    await patchLog(logId, { status: 'calling', ...(callId ? { vapi_call_id: callId } : {}) });
  } catch (err) {
    await patchLog(logId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Failed to reach Vapi',
    });
  }
}

/**
 * Called right after an appointment is saved. Never throws, never blocks booking.
 * - Outside the allowed hours the call is queued ("pending") and sent later by the sweeper / cron route.
 * - `force` (manual admin retry) skips the duplicate guard and the quiet-hours check.
 */
export async function triggerConfirmationCall(
  appt: Appointment,
  opts: { source?: string; force?: boolean } = {}
): Promise<{ queued: boolean; reason?: string }> {
  try {
    if (!voiceCallsEnabled()) return { queued: false, reason: 'Voice calls are disabled or not configured.' };
    if (appt.status && appt.status !== 'confirmed') return { queued: false, reason: 'Appointment is not confirmed.' };

    await ensureDatabaseSchema();
    const source = opts.source || 'booking';

    if (!opts.force && (await hasActiveOrDoneCall(appt.id))) {
      return { queued: false, reason: 'A call was already placed or queued for this appointment.' };
    }

    if (!opts.force && !isWithinCallWindow()) {
      await insertLog(appt.id, 'pending', source);
      startPendingSweeper();
      return { queued: true, reason: 'Outside calling hours - queued for the next window.' };
    }

    const logId = await insertLog(appt.id, 'calling', source);
    await dispatchCall(appt, logId);
    return { queued: true };
  } catch (err) {
    console.error('[voice] triggerConfirmationCall failed:', err);
    return { queued: false, reason: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/** Sends every queued ("pending") call whose time has come. Safe to call repeatedly. */
export async function processPendingCalls(): Promise<{ dispatched: number; skipped: number }> {
  let dispatched = 0;
  let skipped = 0;
  if (!voiceCallsEnabled() || !isWithinCallWindow()) return { dispatched, skipped };

  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<CallLogRow[]>(
    `SELECT * FROM call_logs WHERE status = 'pending' ORDER BY id ASC LIMIT 50`
  );

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  for (const row of rows) {
    const appt = await getAppointmentById(row.appointment_id);
    if (!appt || appt.status !== 'confirmed' || appt.date < today) {
      await patchLog(row.id, { status: 'skipped', error: 'Appointment cancelled, missing or already past.' });
      skipped++;
      continue;
    }
    await patchLog(row.id, { status: 'calling' });
    await dispatchCall(appt, row.id);
    dispatched++;
  }
  return { dispatched, skipped };
}

declare global {
  // eslint-disable-next-line no-var
  var __voiceSweeper: ReturnType<typeof setInterval> | undefined;
}

/** In-process safety net: while queued calls exist, check every 5 minutes. */
function startPendingSweeper(): void {
  if (global.__voiceSweeper) return;
  global.__voiceSweeper = setInterval(async () => {
    try {
      await processPendingCalls();
      const [rows] = await getPool().execute<RowDataPacket[]>(
        `SELECT id FROM call_logs WHERE status = 'pending' LIMIT 1`
      );
      if (rows.length === 0 && global.__voiceSweeper) {
        clearInterval(global.__voiceSweeper);
        global.__voiceSweeper = undefined;
      }
    } catch (err) {
      console.error('[voice] sweeper error:', err);
    }
  }, 5 * 60 * 1000);
}

/* ------------------------------ result from Vapi webhook ------------------------------ */

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  confirmed: 'Patient CONFIRMED the appointment',
  declined: 'Patient said they will NOT attend - please call back',
  reschedule_requested: 'Patient wants to RESCHEDULE - please call back',
  no_answer: 'No answer / voicemail',
  unclear: 'Call was unclear - please verify manually',
};

export async function recordCallResult(input: {
  vapiCallId: string;
  callLogId?: number;
  appointmentId?: string;
  endedReason?: string;
  summary?: string;
  transcript?: string;
  outcome?: string;
  patientNote?: string;
}): Promise<void> {
  await ensureDatabaseSchema();
  const pool = getPool();

  let [rows] = await pool.execute<CallLogRow[]>(
    `SELECT * FROM call_logs WHERE vapi_call_id = ? LIMIT 1`,
    [input.vapiCallId]
  );
  if (rows.length === 0 && input.callLogId) {
    [rows] = await pool.execute<CallLogRow[]>(`SELECT * FROM call_logs WHERE id = ? LIMIT 1`, [
      input.callLogId,
    ]);
  }
  if (rows.length === 0) {
    console.warn('[voice] webhook for unknown call', input.vapiCallId);
    return;
  }
  const log = rows[0];

  const ended = (input.endedReason || '').toLowerCase();
  const noAnswer =
    ended.includes('no-answer') ||
    ended.includes('voicemail') ||
    ended.includes('busy') ||
    ended.includes('did-not-answer');
  const failedTech = ended.includes('failed') || ended.includes('error') || ended.includes('provider');

  const allowed: CallOutcome[] = ['confirmed', 'declined', 'reschedule_requested', 'no_answer', 'unclear'];
  let outcome: CallOutcome = allowed.includes(input.outcome as CallOutcome)
    ? (input.outcome as CallOutcome)
    : 'unclear';
  if (noAnswer) outcome = 'no_answer';

  await patchLog(log.id, {
    status: failedTech && !noAnswer ? 'failed' : 'completed',
    outcome,
    vapi_call_id: input.vapiCallId,
    ...(input.endedReason ? { ended_reason: input.endedReason } : {}),
    ...(input.summary ? { summary: input.summary.slice(0, 2000) } : {}),
    ...(input.transcript ? { transcript: input.transcript } : {}),
  });

  // Leave a one-line note on the appointment so the admin sees the result.
  try {
    const appt = await getAppointmentById(log.appointment_id);
    if (appt) {
      const stamp = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date());
      const extra = input.patientNote ? ` - ${input.patientNote}` : '';
      const line = `[AI confirmation call ${stamp}] ${OUTCOME_LABEL[outcome]}${extra}`;
      const notes = appt.notes ? `${appt.notes}\n${line}` : line;
      await updateAppointment(appt.id, { notes });
    }
  } catch (err) {
    console.error('[voice] could not write call note to appointment:', err);
  }
}
