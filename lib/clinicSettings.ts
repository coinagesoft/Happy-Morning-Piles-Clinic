import type { RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import { getFastAppointments } from './cache';
import {
  ClinicSettings,
  DEFAULT_CLINIC_SETTINGS,
  generateSlots,
  getSlotStep,
  isSlotConflicting,
  normalizeClinicSettings,
} from './slots';

interface ClinicSettingsRow extends RowDataPacket {
  slot_duration: number;
  buffer_time: number;
  sessions: string | null;
  updated_at: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __clinicSettingsCache: { data: ClinicSettings; timestamp: number } | undefined;
}

const SETTINGS_CACHE_TTL_MS = 10_000;

function cloneDefaults(): ClinicSettings {
  return JSON.parse(JSON.stringify(DEFAULT_CLINIC_SETTINGS)) as ClinicSettings;
}

export async function getClinicSettings(forceFresh = false): Promise<ClinicSettings> {
  const cached = global.__clinicSettingsCache;
  if (!forceFresh && cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    await ensureDatabaseSchema();
    const pool = getPool();
    const [rows] = await pool.execute<ClinicSettingsRow[]>(
      `SELECT slot_duration, buffer_time, sessions, updated_at FROM clinic_settings WHERE id = 1`
    );

    let settings = cloneDefaults();
    if (rows.length > 0) {
      const row = rows[0];
      let sessions: unknown = undefined;
      try {
        sessions = row.sessions ? JSON.parse(row.sessions) : undefined;
      } catch {
        sessions = undefined;
      }
      const parsed = normalizeClinicSettings({
        slotDuration: row.slot_duration,
        bufferTime: row.buffer_time,
        sessions,
      });
      if (parsed.settings) settings = parsed.settings;
    }

    global.__clinicSettingsCache = { data: settings, timestamp: Date.now() };
    return settings;
  } catch (err) {
    console.error('[ClinicSettings] Failed to load, using defaults:', err);
    return cached?.data ?? cloneDefaults();
  }
}

export async function saveClinicSettings(settings: ClinicSettings): Promise<ClinicSettings> {
  await ensureDatabaseSchema();
  const pool = getPool();
  await pool.execute(
    `INSERT INTO clinic_settings (id, slot_duration, buffer_time, sessions, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slot_duration = VALUES(slot_duration),
       buffer_time = VALUES(buffer_time),
       sessions = VALUES(sessions),
       updated_at = VALUES(updated_at)`,
    [
      settings.slotDuration,
      settings.bufferTime,
      JSON.stringify(settings.sessions),
      new Date().toISOString(),
    ]
  );
  global.__clinicSettingsCache = { data: settings, timestamp: Date.now() };
  return settings;
}

/** Sync read of the last loaded appointment length (used as calendar event length). */
export function getCachedSlotDuration(): number {
  return global.__clinicSettingsCache?.data.slotDuration ?? DEFAULT_CLINIC_SETTINGS.slotDuration;
}

export async function getClinicSlotValues(): Promise<string[]> {
  const settings = await getClinicSettings();
  return generateSlots(settings).map((s) => s.value);
}

/**
 * Checks whether `time` on `date` clashes with an existing (non-cancelled)
 * appointment, taking duration + buffer into account.
 */
export async function isTimeSlotTaken(
  date: string,
  time: string,
  excludeId?: string
): Promise<boolean> {
  const [settings, appointments] = await Promise.all([getClinicSettings(), getFastAppointments()]);
  const step = getSlotStep(settings);
  const times = appointments
    .filter((a) => a.date === date && a.status !== 'cancelled' && a.id !== excludeId)
    .map((a) => a.time);
  return isSlotConflicting(time, times, step);
}
