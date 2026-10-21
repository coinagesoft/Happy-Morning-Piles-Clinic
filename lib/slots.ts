/**
 * Shared (client + server safe) appointment slot logic.
 * No database / Node imports here so it can be used inside client components.
 *
 * A slot "step" = appointment duration + buffer time.
 * Slots are generated inside each working session (e.g. 09:00-13:30, 15:00-18:00).
 * Defaults (45 min, 0 buffer) reproduce the clinic's original fixed slot list.
 */

export interface SessionWindow {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface ClinicSettings {
  slotDuration: number; // minutes per appointment
  bufferTime: number; // minutes gap between two appointments
  sessions: SessionWindow[];
}

export interface ClinicSlot {
  value: string; // HH:mm (24h)
  label: string; // h:mm AM/PM
}

export const MIN_DURATION = 5;
export const MAX_DURATION = 240;
export const MAX_BUFFER = 120;
export const MAX_SESSIONS = 6;

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  slotDuration: 45,
  bufferTime: 0,
  sessions: [
    { start: '09:00', end: '13:30' },
    { start: '15:00', end: '18:00' },
  ],
};

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

/** Generates every bookable slot for the given settings, sorted by time. */
export function generateSlots(settings: ClinicSettings): ClinicSlot[] {
  const step = getSlotStep(settings);
  const seen = new Set<string>();
  const slots: ClinicSlot[] = [];

  if (step <= 0) return slots;

  for (const session of settings.sessions) {
    if (!isValidTime(session.start) || !isValidTime(session.end)) continue;
    const start = timeToMinutes(session.start);
    const end = timeToMinutes(session.end);
    for (let t = start; t + settings.slotDuration <= end; t += step) {
      const value = minutesToTime(t);
      if (!seen.has(value)) {
        seen.add(value);
        slots.push({ value, label: formatSlotLabel(value) });
      }
    }
  }

  return slots.sort((a, b) => timeToMinutes(a.value) - timeToMinutes(b.value));
}

/**
 * Validates + normalises untrusted settings input (admin form / API body).
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

  if (!Array.isArray(raw.sessions) || raw.sessions.length === 0) {
    return { error: 'Add at least one working session (e.g. 09:00 - 13:30).' };
  }
  if (raw.sessions.length > MAX_SESSIONS) {
    return { error: `You can add at most ${MAX_SESSIONS} working sessions.` };
  }

  const sessions: SessionWindow[] = [];
  for (const s of raw.sessions as Array<Record<string, unknown>>) {
    if (!s || !isValidTime(s.start) || !isValidTime(s.end)) {
      return { error: 'Each session needs a valid start and end time (HH:mm).' };
    }
    const startMin = timeToMinutes(s.start);
    const endMin = timeToMinutes(s.end);
    if (endMin <= startMin) {
      return { error: `Session ${s.start} - ${s.end}: end time must be after start time.` };
    }
    if (endMin - startMin < slotDuration) {
      return {
        error: `Session ${s.start} - ${s.end} is shorter than one ${slotDuration}-minute appointment.`,
      };
    }
    sessions.push({ start: s.start, end: s.end });
  }

  sessions.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  for (let i = 1; i < sessions.length; i++) {
    if (timeToMinutes(sessions[i].start) < timeToMinutes(sessions[i - 1].end)) {
      return { error: 'Working sessions must not overlap each other.' };
    }
  }

  const settings: ClinicSettings = { slotDuration, bufferTime, sessions };
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
