import { getPool, ensureDatabaseSchema } from './db';

/**
 * Per-doctor storage for clinic timings and leave / blackout overrides.
 * Runs once per server process, on its own, so it also works on databases that were
 * created before per-doctor availability existed (no manual SQL needed).
 */
const g = globalThis as unknown as { __doctorScopeReady?: Promise<void> };

export function ensureDoctorScopeSchema(): Promise<void> {
  if (!g.__doctorScopeReady) {
    g.__doctorScopeReady = (async () => {
      await ensureDatabaseSchema();
      const pool = getPool();

      // Leave / blackout rows can now belong to one doctor (NULL = whole clinic, the old behaviour)
      try {
        await pool.execute(`ALTER TABLE doctor_availability ADD COLUMN doctor_slug VARCHAR(64) NULL`);
      } catch {
        // Column already exists
      }
      try {
        await pool.execute(`ALTER TABLE doctor_availability ADD INDEX idx_override_doctor (doctor_slug)`);
      } catch {
        // Index already exists
      }

      // Each doctor's own weekly timings, appointment length, buffer and locations
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS doctor_clinic_settings (
          doctor_slug VARCHAR(64) PRIMARY KEY,
          slot_duration INT NOT NULL DEFAULT 45,
          buffer_time INT NOT NULL DEFAULT 0,
          sessions TEXT,
          weekly LONGTEXT NULL,
          locations TEXT NULL,
          updated_at VARCHAR(64) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      g.__doctorScopeReady = undefined; // retry on the next request
      throw err;
    });
  }
  return g.__doctorScopeReady;
}
