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
  weekly: string | null;
  locations: string | null;
  updated_at: string;
}

// Cache lives on globalThis so it survives hot reloads. It is accessed through a local
// cast instead of `declare global`, which avoids duplicate-declaration type errors.
const clinicSettingsGlobal = globalThis as unknown as {
  __clinicSettingsCache?: { data: ClinicSettings; timestamp: number };
};

const SETTINGS_CACHE_TTL_MS = 10_000;

/**
 * Makes sure the `weekly` and `locations` columns exist. This runs on its own (once per
 * server process) because the main schema setup is skipped after a hot reload, which left
 * older databases without the new columns and made saving fail.
 */
async function ensureSettingsColumns(): Promise<void> {
  const g = globalThis as unknown as { __clinicSettingsColumnsReady?: boolean };
  if (g.__clinicSettingsColumnsReady) return;
  await ensureDatabaseSchema();
  const pool = getPool();
  for (const column of ['weekly LONGTEXT NULL', 'locations TEXT NULL']) {
    try {
      await pool.execute(`ALTER TABLE clinic_settings ADD COLUMN ${column}`);
    } catch {
      // Column already exists
    }
  }
  g.__clinicSettingsColumnsReady = true;
}

function cloneDefaults(): ClinicSettings {
  return JSON.parse(JSON.stringify(DEFAULT_CLINIC_SETTINGS)) as ClinicSettings;
}

export async function getClinicSettings(forceFresh = false): Promise<ClinicSettings> {
  const cached = clinicSettingsGlobal.__clinicSettingsCache;
  if (!forceFresh && cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    await ensureSettingsColumns();
    const pool = getPool();
    const [rows] = await pool.execute<ClinicSettingsRow[]>(
      `SELECT slot_duration, buffer_time, sessions, weekly, locations, updated_at FROM clinic_settings WHERE id = 1`
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
      // The day-wise schedule and the locations list are stored as JSON.
      // Rows saved before they existed fall back to the legacy `sessions` list.
      let weekly: unknown = undefined;
      try {
        weekly = row.weekly ? JSON.parse(row.weekly) : undefined;
      } catch {
        weekly = undefined;
      }
      let locations: unknown = undefined;
      try {
        locations = row.locations ? JSON.parse(row.locations) : undefined;
      } catch {
        locations = undefined;
      }
      const parsed = normalizeClinicSettings({
        slotDuration: row.slot_duration,
        bufferTime: row.buffer_time,
        sessions,
        weekly,
        locations,
      });
      if (parsed.settings) settings = parsed.settings;
    }

    clinicSettingsGlobal.__clinicSettingsCache = { data: settings, timestamp: Date.now() };
    return settings;
  } catch (err) {
    console.error('[ClinicSettings] Failed to load, using defaults:', err);
    return cached?.data ?? cloneDefaults();
  }
}

export async function saveClinicSettings(settings: ClinicSettings): Promise<ClinicSettings> {
  await ensureSettingsColumns();
  const pool = getPool();
  await pool.execute(
    `INSERT INTO clinic_settings (id, slot_duration, buffer_time, sessions, weekly, locations, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slot_duration = VALUES(slot_duration),
       buffer_time = VALUES(buffer_time),
       sessions = VALUES(sessions),
       weekly = VALUES(weekly),
       locations = VALUES(locations),
       updated_at = VALUES(updated_at)`,
    [
      settings.slotDuration,
      settings.bufferTime,
      JSON.stringify(settings.sessions),
      JSON.stringify(settings.weekly),
      JSON.stringify(settings.locations),
      new Date().toISOString(),
    ]
  );
  clinicSettingsGlobal.__clinicSettingsCache = { data: settings, timestamp: Date.now() };
  return settings;
}

/** Sync read of the last loaded appointment length (used as calendar event length). */
export function getCachedSlotDuration(): number {
  return clinicSettingsGlobal.__clinicSettingsCache?.data.slotDuration ?? DEFAULT_CLINIC_SETTINGS.slotDuration;
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