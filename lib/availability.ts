import type { RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import { ensureDoctorScopeSchema } from './doctorScope';
import {
  getFastDoctorOverrides,
  updateCachedOverride,
  removeCachedOverride,
  getFastDoctorDateBlock,
  getFastDoctorBlockedSlots,
  getFastDoctorBlockedDates,
  overrideAppliesToDoctor,
} from './cache';

export interface DoctorOverride {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'full_day' | 'specific_slots';
  blockedSlots?: string[]; // e.g. ["10:30", "11:15"]
  reason: string;
  /** Doctor this leave / blackout belongs to. Empty = applies to the whole clinic (older data). */
  doctorSlug?: string;
  createdAt: string;
}

/**
 * Overrides one login may see:
 * - a doctor login: their own + clinic-wide ones
 * - admin / receptionist (no doctorSlug): everything
 * - public visitors choosing a doctor: that doctor's + clinic-wide ones
 */
export async function getAllDoctorOverrides(options?: {
  doctorSlug?: string;
  all?: boolean;
}): Promise<DoctorOverride[]> {
  const list = await getFastDoctorOverrides();
  if (options?.all) return list;
  return list.filter((o) => overrideAppliesToDoctor(o, options?.doctorSlug));
}

export async function getDoctorOverrideById(id: string): Promise<DoctorOverride | undefined> {
  const list = await getFastDoctorOverrides();
  return list.find((o) => o.id === id);
}

export async function saveDoctorOverride(override: DoctorOverride): Promise<DoctorOverride> {
  await ensureDatabaseSchema();
  await ensureDoctorScopeSchema();
  const pool = getPool();
  const blockedSlotsJson =
    override.type === 'specific_slots' && Array.isArray(override.blockedSlots)
      ? JSON.stringify(override.blockedSlots)
      : null;

  await pool.execute(
    `INSERT INTO doctor_availability (
      id, override_date, override_type, blocked_slots, reason, doctor_slug, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      override_date = VALUES(override_date),
      override_type = VALUES(override_type),
      blocked_slots = VALUES(blocked_slots),
      reason = VALUES(reason),
      doctor_slug = VALUES(doctor_slug)`,
    [
      override.id,
      override.date,
      override.type,
      blockedSlotsJson,
      override.reason,
      override.doctorSlug || null,
      override.createdAt,
    ]
  );

  updateCachedOverride(override);
  return override;
}

export async function deleteDoctorOverride(id: string): Promise<void> {
  await ensureDatabaseSchema();
  await ensureDoctorScopeSchema();
  const pool = getPool();
  await pool.execute(`DELETE FROM doctor_availability WHERE id = ?`, [id]);
  removeCachedOverride(id);
}

export async function isDateBlockedByDoctor(
  date: string,
  doctorSlug?: string
): Promise<{ blocked: boolean; reason?: string }> {
  return getFastDoctorDateBlock(date, doctorSlug);
}

export async function getBlockedSlotsForDate(
  date: string,
  allPossibleSlots?: string[],
  doctorSlug?: string
): Promise<string[]> {
  return getFastDoctorBlockedSlots(date, allPossibleSlots, doctorSlug);
}

export async function getDoctorBlockedDates(
  doctorSlug?: string
): Promise<{ date: string; reason: string }[]> {
  return getFastDoctorBlockedDates(doctorSlug);
}