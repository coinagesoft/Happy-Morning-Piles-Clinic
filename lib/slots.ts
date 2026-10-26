/**
 * Shared (client + server safe) appointment slot logic.
 * No database / Node imports here so it can be used inside client components.
 *
 * A slot "step" = appointment duration + buffer time.
 * Slots are generated inside each working session of that weekday
 * (e.g. Monday 09:30-13:00 + 18:30-20:00), and every session has its own location.
 */

export const DEFAULT_LOCATION = 'Akurdi Clinic';
export const MAX_LOCATION_LENGTH = 120;

export interface SessionWindow {
  start: string; // HH:mm
  end: string; // HH:mm
  location?: string; // where the doctor sits during this session
}

export interface DaySchedule {
  closed: boolean;
  sessions: SessionWindow[];
}

/** Index follows JS Date#getDay(): 0 = Sunday ... 6 = Saturday. */
export type WeeklySchedule = DaySchedule[];

export interface ClinicSettings {
  slotDuration: number; // minutes per appointment
  bufferTime: number; // minutes gap between two appointments
  /** Legacy single list of sessions (kept in sync with the first open weekday). */
  sessions: SessionWindow[];
  /** Day-wise timings + location. */
  weekly: WeeklySchedule;
}

export interface ClinicSlot {
  value: string; // HH:mm (24h)
  label: string; // h:mm AM/PM
  location?: string;
}

export const MIN_DURATION = 5;
export const MAX_DURATION = 240;
export const MAX_BUFFER = 120;
export const MAX_SESSIONS = 6;

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
/** Display order for the admin editor (Monday first). */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function day(sessions: Array<[string, string]>, location = DEFAULT_LOCATION): DaySchedule {
  return {
    closed: sessions.length === 0,
    sessions: sessions.map(([start, end]) => ({ start, end, location })),
  };
}

/** Clinic timings from the printed schedule (Sunday closed). */
export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = [
  day([]), // Sunday - closed
  day([['09:30', '13:00'], ['18:30', '20:00']]), // Monday
  day([['09:30', '13:00'], ['17:00', '20:00']]), // Tuesday
  day([['16:00', '20:00']]), // Wednesday
  day([['09:30', '13:00'], ['17:00', '20:00']]), // Thursday
  day([['16:00', '20:00']]), // Friday
  day([['09:30', '18:00']]), // Saturday
];

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  slotDuration: 45,
  bufferTime: 0,
  sessions: DEFAULT_WEEKLY_SCHEDULE[1].sessions.map((s) => ({ ...s })),
  weekly: DEFAULT_WEEKLY_SCHEDULE.map((d) => ({
    closed: d.closed,
    sessions: d.sessions.map((s) => ({ ...s })),
  })),
};

/** Weekday (0 = Sunday) of a YYYY-MM-DD date, independent of the server time zone. */
export function getWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

export function getDaySchedule(settings: ClinicSettings, date: string): DaySchedule {
  const weekly = settings.weekly;
  const dow = getWeekday(date);
  if (Array.isArray(weekly) && weekly[dow]) return weekly[dow];
  return { closed: dow === 0, sessions: dow === 0 ? [] : settings.sessions };
}

/** True when the clinic has no timings at all on that date's weekday (e.g. Sunday). */
export function isClinicClosedOn(settings: ClinicSettings, date: string): boolean {
  const d = getDaySchedule(settings, date);
  return d.closed || d.sessions.length === 0;
}

/** Closed weekdays as JS day numbers, e.g. [0]. */
export function getClosedWeekdays(settings: ClinicSettings): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = settings.weekly?.[i];
    if (!d || d.closed || d.sessions.length === 0) out.push(i);
  }
  return out;
}

/** "9:30 AM - 1:00 PM, 6:30 PM - 8:00 PM" style summary of one weekday. */
export function formatDaySummary(day: DaySchedule): string {
  if (day.closed || day.sessions.length === 0) return 'Closed';
  return day.sessions
    .map((s) => `${formatSlotLabel(s.start)} - ${formatSlotLabel(s.end)}`)
    .join(', ');
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatSlotLabel(time: string): string {
  if (!isValidTime(time)) return time;
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function getSlotStep(settings: ClinicSettings): number {
  return settings.slotDuration + settings.bufferTime;
}

function slotsFromSessions(
  sessions: SessionWindow[],
  slotDuration: number,
  step: number,
  into: Map<string, ClinicSlot>
) {
  for (const session of sessions) {
    if (!isValidTime(session.start) || !isValidTime(session.end)) continue;
    const start = timeToMinutes(session.start);
    const end = timeToMinutes(session.end);
    for (let t = start; t + slotDuration <= end; t += step) {
      const value = minutesToTime(t);
      if (!into.has(value)) {
        into.set(value, {
          value,
          label: formatSlotLabel(value),
          location: session.location || DEFAULT_LOCATION,
        });
      }
    }
  }
}

/**
 * Generates bookable slots, sorted by time.
 * - With `date`: only the slots of that weekday (empty when the clinic is closed).
 * - Without `date`: the union of every open weekday (used for the "known slot grid").
 */
export function generateSlots(settings: ClinicSettings, date?: string): ClinicSlot[] {
  const step = getSlotStep(settings);
  const map = new Map<string, ClinicSlot>();
  if (step <= 0) return [];

  if (date) {
    const d = getDaySchedule(settings, date);
    if (!d.closed) slotsFromSessions(d.sessions, settings.slotDuration, step, map);
  } else if (Array.isArray(settings.weekly) && settings.weekly.length === 7) {
    for (const d of settings.weekly) {
      if (!d.closed) slotsFromSessions(d.sessions, settings.slotDuration, step, map);
    }
  } else {
    slotsFromSessions(settings.sessions, settings.slotDuration, step, map);
  }

  return Array.from(map.values()).sort(
    (a, b) => timeToMinutes(a.value) - timeToMinutes(b.value)
  );
}

/** Where the doctor sits for the session that contains `time` on `date`. */
export function getSlotLocation(
  settings: ClinicSettings,
  date: string,
  time: string
): string | undefined {
  return generateSlots(settings, date).find((s) => s.value === time)?.location;
}

function normalizeSessions(
  rawSessions: unknown,
  slotDuration: number,
  label: string
): { sessions?: SessionWindow[]; error?: string } {
  if (!Array.isArray(rawSessions)) return { error: `${label}: timings are missing.` };
  if (rawSessions.length > MAX_SESSIONS) {
    return { error: `${label}: you can add at most ${MAX_SESSIONS} sessions.` };
  }

  const sessions: SessionWindow[] = [];
  for (const s of rawSessions as Array<Record<string, unknown>>) {
    if (!s || !isValidTime(s.start) || !isValidTime(s.end)) {
      return { error: `${label}: each session needs a valid start and end time.` };
    }
    const startMin = timeToMinutes(s.start);
    const endMin = timeToMinutes(s.end);
    if (endMin <= startMin) {
      return { error: `${label} ${s.start} - ${s.end}: end time must be after start time.` };
    }
    if (endMin - startMin < slotDuration) {
      return {
        error: `${label} ${s.start} - ${s.end} is shorter than one ${slotDuration}-minute appointment.`,
      };
    }
    const location =
      typeof s.location === 'string' && s.location.trim()
        ? s.location.trim().slice(0, MAX_LOCATION_LENGTH)
        : DEFAULT_LOCATION;
    sessions.push({ start: s.start, end: s.end, location });
  }

  sessions.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  for (let i = 1; i < sessions.length; i++) {
    if (timeToMinutes(sessions[i].start) < timeToMinutes(sessions[i - 1].end)) {
      return { error: `${label}: sessions must not overlap each other.` };
    }
  }
  return { sessions };
}

/**
 * Validates + normalises untrusted settings input (admin form / API body).
 * Accepts the new day-wise `weekly` array; a legacy payload with only `sessions`
 * is expanded to Monday-Saturday (Sunday closed).
 */
export function normalizeClinicSettings(
  input: unknown
): { settings?: ClinicSettings; error?: string } {
  if (!input || typeof input !== 'object') {
    return { error: 'Settings payload is missing.' };
  }
  const raw = input as Record<string, unknown>;

  const slotDuration = Number(raw.slotDuration);
  const bufferTime = Number(raw.bufferTime);

  if (!Number.isInteger(slotDuration) || slotDuration < MIN_DURATION || slotDuration > MAX_DURATION) {
    return {
      error: `Appointment duration must be a whole number between ${MIN_DURATION} and ${MAX_DURATION} minutes.`,
    };
  }
  if (!Number.isInteger(bufferTime) || bufferTime < 0 || bufferTime > MAX_BUFFER) {
    return { error: `Buffer time must be a whole number between 0 and ${MAX_BUFFER} minutes.` };
  }

  let rawWeekly: Array<{ closed?: unknown; sessions?: unknown }>;
  if (Array.isArray(raw.weekly) && raw.weekly.length === 7) {
    rawWeekly = raw.weekly as Array<{ closed?: unknown; sessions?: unknown }>;
  } else if (Array.isArray(raw.sessions) && raw.sessions.length > 0) {
    rawWeekly = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      i === 0 ? { closed: true, sessions: [] } : { closed: false, sessions: raw.sessions }
    );
  } else {
    return { error: 'Add the weekly timings (at least one open day with one session).' };
  }

  const weekly: WeeklySchedule = [];
  for (let i = 0; i < 7; i++) {
    const entry = rawWeekly[i] || {};
    const label = WEEKDAY_NAMES[i];
    const rawSessions = Array.isArray(entry.sessions) ? entry.sessions : [];
    if (entry.closed === true || rawSessions.length === 0) {
      weekly.push({ closed: true, sessions: [] });
      continue;
    }
    const result = normalizeSessions(rawSessions, slotDuration, label);
    if (!result.sessions) return { error: result.error };
    weekly.push({ closed: false, sessions: result.sessions });
  }

  const firstOpen = weekly.find((d) => !d.closed);
  if (!firstOpen) {
    return { error: 'At least one weekday must be open for appointments.' };
  }

  const settings: ClinicSettings = {
    slotDuration,
    bufferTime,
    sessions: firstOpen.sessions.map((s) => ({ ...s })),
    weekly,
  };
  if (generateSlots(settings).length === 0) {
    return { error: 'These settings produce no bookable slots.' };
  }
  return { settings };
}

/**
 * Two appointments are in conflict when their start times are closer than
 * (duration + buffer). On the generated grid this only matches the exact same
 * slot, but it also protects old bookings after the admin changes the settings.
 */
export function isSlotConflicting(slot: string, bookedTimes: string[], step: number): boolean {
  const s = timeToMinutes(slot);
  return bookedTimes.some((t) => isValidTime(t) && Math.abs(timeToMinutes(t) - s) < step);
}

/** Returns the grid slots that are NOT bookable because of existing appointments. */
export function expandBookedTimes(
  slotValues: string[],
  bookedTimes: string[],
  step: number
): string[] {
  return slotValues.filter((slot) => isSlotConflicting(slot, bookedTimes, step));
}

/** True when every slot is taken by an appointment (with buffer) or doctor-blocked. */
export function areAllSlotsOccupied(
  slotValues: string[],
  bookedTimes: string[],
  blockedSlots: string[],
  step: number
): boolean {
  if (slotValues.length === 0) return false;
  const blocked = new Set(blockedSlots);
  return slotValues.every((slot) => blocked.has(slot) || isSlotConflicting(slot, bookedTimes, step));
}