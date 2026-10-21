import type { RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import {
  getFastDoctorOverrides,
  updateCachedOverride,
  removeCachedOverride,
  getFastDoctorDateBlock,
  getFastDoctorBlockedSlots,
  getFastDoctorBlockedDates,
} from './cache';

export interface DoctorOverride {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'full_day' | 'specific_slots';
  blockedSlots?: string[]; // e.g. ["10:30", "11:15"]
  reason: string;
  createdAt: string;
}

interface DoctorOverrideRow extends RowDataPacket {
  id: string;
  override_date: string;
  override_type: 'full_day' | 'specific_slots';
  blocked_slots: string | null;
  reason: string;
  created_at: string;
}

function mapRowToOverride(row: DoctorOverrideRow): DoctorOverride {
  let blockedSlots: string[] | undefined = undefined;
  if (row.blocked_slots) {
    try {
      const parsed = JSON.parse(row.blocked_slots);
      if (Array.isArray(parsed)) {
        blockedSlots = parsed;
      }
    } catch {
      blockedSlots = undefined;
    }
  }

  return {
    id: row.id,
    date: row.override_date,
    type: row.override_type,
    blockedSlots,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export async function getAllDoctorOverrides(): Promise<DoctorOverride[]> {
  return getFastDoctorOverrides();
}

export async function saveDoctorOverride(override: DoctorOverride): Promise<DoctorOverride> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const blockedSlotsJson =
    override.type === 'specific_slots' && Array.isArray(override.blockedSlots)
      ? JSON.stringify(override.blockedSlots)
      : null;

  await pool.execute(
    `INSERT INTO doctor_availability (
      id, override_date, override_type, blocked_slots, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      override_date = VALUES(override_date),
      override_type = VALUES(override_type),
      blocked_slots = VALUES(blocked_slots),
      reason = VALUES(reason)`,
    [
      override.id,
      override.date,
      override.type,
      blockedSlotsJson,
      override.reason,
      override.createdAt,
    ]
  );

  updateCachedOverride(override);
  return override;
}

export async function deleteDoctorOverride(id: string): Promise<DoctorOverride[]> {
  await ensureDatabaseSchema();
  const pool = getPool();
  await pool.execute(`DELETE FROM doctor_availability WHERE id = ?`, [id]);
  removeCachedOverride(id);
  return getAllDoctorOverrides();
}

export async function isDateBlockedByDoctor(
  date: string
): Promise<{ blocked: boolean; reason?: string }> {
  return getFastDoctorDateBlock(date);
}

export async function getBlockedSlotsForDate(
  date: string,
  allPossibleSlots?: string[]
): Promise<string[]> {
  return getFastDoctorBlockedSlots(date, allPossibleSlots);
}

export async function getDoctorBlockedDates(): Promise<{ date: string; reason: string }[]> {
  return getFastDoctorBlockedDates();
}
