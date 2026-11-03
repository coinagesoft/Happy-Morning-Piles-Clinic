import type { RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import { ensureDoctorScopeSchema } from './doctorScope';
import { getFastAppointments, appointmentBlocksDoctor } from './cache';
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

type CacheEntry = { data: ClinicSettings; timestamp: number };

// Caches live on globalThis so they survive hot reloads. They are accessed through a local
// cast instead of `declare global`, which avoids duplicate-declaration type errors.
const clinicSettingsGlobal = globalThis as unknown as {
  /** Clinic default timings (used when a doctor has not set their own, or no doctor is chosen). */
  __clinicSettingsCache?: CacheEntry;
  /** Per-doctor timings, keyed by doctor slug. */
  __doctorSettingsCache?: Record<string, CacheEntry>;
};

const SETTINGS_CACHE_TTL_MS = 10_000;

function doctorCache(): Record<string, CacheEntry> {
  if (!clinicSettingsGlobal.__doctorSettingsCache) clinicSettingsGlobal.__doctorSettingsCache = {};
  return clinicSettingsGlobal.__doctorSettingsCache;
}

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
  await ensureDoctorScopeSchema();
  g.__clinicSettingsColumnsReady = true;
}

function cloneDefaults(): ClinicSettings {
  return JSON.parse(JSON.stringify(DEFAULT_CLINIC_SETTINGS)) as ClinicSettings;
}

function safeParse(value: string | null | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function settingsFromRow(row: ClinicSettingsRow): ClinicSettings | undefined {
  // The day-wise schedule and the locations list are stored as JSON.
  // Rows saved before they existed fall back to the legacy `sessions` list.
  const parsed = normalizeClinicSettings({
    slotDuration: row.slot_duration,
    bufferTime: row.buffer_time,
    sessions: safeParse(row.sessions),
    weekly: safeParse(row.weekly),
    locations: safeParse(row.locations),
  });
  return parsed.settings;
}

/** Clinic default timings (the shared row). */
async function loadClinicDefaults(forceFresh: boolean): Promise<ClinicSettings> {
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
      const parsed = settingsFromRow(rows[0]);
      if (parsed) settings = parsed;
    }
    clinicSettingsGlobal.__clinicSettingsCache = { data: settings, timestamp: Date.now() };
    return settings;
  } catch (err) {
    console.error('[ClinicSettings] Failed to load, using defaults:', err);
    return cached?.data ?? cloneDefaults();
  }
}

/**
 * Timings for one doctor. A doctor who has never saved their own timings gets the clinic
 * defaults; with no doctor given the clinic defaults are returned.
 */
export async function getClinicSettings(
  doctorSlug?: string | null,
  forceFresh = false
): Promise<ClinicSettings> {
  const slug = (doctorSlug || '').trim();
  if (!slug) return loadClinicDefaults(forceFresh);

  const cache = doctorCache();
  const cached = cache[slug];
  if (!forceFresh && cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    await ensureSettingsColumns();
    const pool = getPool();
    const [rows] = await pool.execute<ClinicSettingsRow[]>(
      `SELECT slot_duration, buffer_time, sessions, weekly, locations, updated_at
       FROM doctor_clinic_settings WHERE doctor_slug = ?`,
      [slug]
    );
    let settings: ClinicSettings | undefined;
    if (rows.length > 0) settings = settingsFromRow(rows[0]);
    if (!settings) settings = await loadClinicDefaults(forceFresh);
    cache[slug] = { data: settings, timestamp: Date.now() };
    return settings;
  } catch (err) {
    console.error(`[ClinicSettings] Failed to load timings for ${slug}:`, err);
    return cached?.data ?? (await loadClinicDefaults(false));
  }
}

/** Saves one doctor's timings, or the clinic defaults when no doctor is given. */
export async function saveClinicSettings(
  settings: ClinicSettings,
  doctorSlug?: string | null
): Promise<ClinicSettings> {
  await ensureSettingsColumns();
  const pool = getPool();
  const slug = (doctorSlug || '').trim();

  if (slug) {
    await pool.execute(
      `INSERT INTO doctor_clinic_settings
         (doctor_slug, slot_duration, buffer_time, sessions, weekly, locations, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         slot_duration = VALUES(slot_duration),
         buffer_time = VALUES(buffer_time),
         sessions = VALUES(sessions),
         weekly = VALUES(weekly),
         locations = VALUES(locations),
         updated_at = VALUES(updated_at)`,
      [
        slug,
        settings.slotDuration,
        settings.bufferTime,
        JSON.stringify(settings.sessions),
        JSON.stringify(settings.weekly),
        JSON.stringify(settings.locations),
        new Date().toISOString(),
      ]
    );
    doctorCache()[slug] = { data: settings, timestamp: Date.now() };
    return settings;
  }

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
  // Doctors that never saved their own timings follow the clinic defaults, so drop their cache
  clinicSettingsGlobal.__doctorSettingsCache = {};
  return settings;
}

/** Sync read of the last loaded appointment length (used as calendar event length). */
export function getCachedSlotDuration(): number {
  return clinicSettingsGlobal.__clinicSettingsCache?.data.slotDuration ?? DEFAULT_CLINIC_SETTINGS.slotDuration;
}

export async function getClinicSlotValues(doctorSlug?: string | null): Promise<string[]> {
  const settings = await getClinicSettings(doctorSlug);
  return generateSlots(settings).map((s) => s.value);
}

/**
 * Checks whether `time` on `date` clashes with an existing (non-cancelled)
 * appointment of that doctor, taking that doctor's duration + buffer into account.
 */
export async function isTimeSlotTaken(
  date: string,
  time: string,
  excludeId?: string,
  doctorSlug?: string
): Promise<boolean> {
  const [settings, appointments] = await Promise.all([
    getClinicSettings(doctorSlug),
    getFastAppointments(),
  ]);
  const step = getSlotStep(settings);
  const times = appointments
    .filter(
      (a) =>
        a.date === date &&
        a.status !== 'cancelled' &&
        a.id !== excludeId &&
        appointmentBlocksDoctor(a, doctorSlug)
    )
    .map((a) => a.time);
  return isSlotConflicting(time, times, step);
}