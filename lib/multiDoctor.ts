import crypto from 'crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from '@/lib/db';

export type StaffRole = 'super_admin' | 'doctor' | 'receptionist' | 'pharmacist';

export interface ClinicDoctor {
  id: string;
  name: string;
  email: string;
  location: string;
  active: boolean;
  createdAt: string;
}

let initialized = false;

export async function ensureMultiDoctorSchema() {
  await ensureDatabaseSchema();
  if (initialized) return;
  const pool = getPool();
  await pool.execute(`CREATE TABLE IF NOT EXISTS clinic_locations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(180) NOT NULL UNIQUE,
    address VARCHAR(500) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS clinic_doctors (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    location_id VARCHAR(64) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_doctor_location (location_id),
    CONSTRAINT fk_doctor_location FOREIGN KEY (location_id) REFERENCES clinic_locations(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS doctor_schedules (
    id VARCHAR(64) PRIMARY KEY,
    doctor_id VARCHAR(64) NOT NULL,
    location_id VARCHAR(64) NOT NULL,
    weekday TINYINT NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    slot_duration INT NOT NULL DEFAULT 30,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_schedule_doctor_day (doctor_id, weekday),
    CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES clinic_doctors(id) ON DELETE CASCADE,
    CONSTRAINT fk_schedule_location FOREIGN KEY (location_id) REFERENCES clinic_locations(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  // Preserve the two legacy doctor accounts so they can also be scheduled and assigned.
  const legacyDoctors = [
    ['user-doctor-1', 'Dr. Mahesh Shete', 'shivrajrbabar@gmail.com'],
    ['user-doctor-2', 'Dr. Mahesh Shete', 'doctor@gmail.com'],
  ];
  for (const [id, name, email] of legacyDoctors) {
    await pool.execute(
      `INSERT IGNORE INTO clinic_doctors (id, name, email, password_hash, location_id, active, created_at) VALUES (?, ?, ?, ?, NULL, 1, ?)`,
      [id, name, email, hashStaffPassword(`legacy-disabled-${crypto.randomUUID()}`), new Date().toISOString()]
    );
  }

  const safeAlter = async (sql: string) => { try { await pool.execute(sql); } catch (e) { const message = String((e as Error)?.message || e); if (!/duplicate column|duplicate key name/i.test(message)) throw e; } };
  await safeAlter('ALTER TABLE appointments ADD COLUMN assigned_doctor_id VARCHAR(64) NULL');
  await safeAlter('ALTER TABLE appointments ADD COLUMN assigned_by_user_id VARCHAR(64) NULL');
  await safeAlter('ALTER TABLE appointments ADD COLUMN assigned_at VARCHAR(64) NULL');
  await safeAlter('ALTER TABLE appointments ADD INDEX idx_appointment_doctor_date (assigned_doctor_id, appointment_date)');
  initialized = true;
}

export function hashStaffPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyStaffPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = String(stored || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function findDatabaseDoctorByEmail(email: string) {
  await ensureMultiDoctorSchema();
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `SELECT id, name, email, password_hash, active FROM clinic_doctors WHERE LOWER(email) = LOWER(?) LIMIT 1`,
    [email.trim()]
  );
  return rows[0] || null;
}

export async function listDoctors() {
  await ensureMultiDoctorSchema();
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `SELECT d.id, d.name, d.email, d.active, d.created_at, l.id AS location_id, l.name AS location_name
     FROM clinic_doctors d LEFT JOIN clinic_locations l ON l.id = d.location_id ORDER BY d.name`
  );
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, active: Boolean(r.active), createdAt: r.created_at, locationId: r.location_id, location: r.location_name || '' }));
}

export async function listLocations() {
  await ensureMultiDoctorSchema();
  const [rows] = await getPool().execute<RowDataPacket[]>(`SELECT id, name, address, active FROM clinic_locations ORDER BY name`);
  return rows.map((r) => ({ id: r.id, name: r.name, address: r.address || '', active: Boolean(r.active) }));
}

export async function createLocation(name: string, address = '') {
  await ensureMultiDoctorSchema();
  const id = crypto.randomUUID();
  await getPool().execute(`INSERT INTO clinic_locations (id, name, address, created_at) VALUES (?, ?, ?, ?)`, [id, name.trim(), address.trim() || null, new Date().toISOString()]);
  return { id, name: name.trim(), address: address.trim() };
}

export async function createDoctor(input: { name: string; email: string; password: string; locationId?: string | null }) {
  await ensureMultiDoctorSchema();
  const id = crypto.randomUUID();
  await getPool().execute<ResultSetHeader>(
    `INSERT INTO clinic_doctors (id, name, email, password_hash, location_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.name.trim(), input.email.trim().toLowerCase(), hashStaffPassword(input.password), input.locationId || null, new Date().toISOString()]
  );
  return { id, name: input.name.trim(), email: input.email.trim().toLowerCase(), locationId: input.locationId || null };
}

export async function replaceDoctorSchedule(doctorId: string, entries: Array<{ locationId: string; weekday: number; startTime: string; endTime: string; slotDuration?: number; active?: boolean }>) {
  await ensureMultiDoctorSchema();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM doctor_schedules WHERE doctor_id = ?`, [doctorId]);
    for (const entry of entries) {
      if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6) throw new Error('weekday must be between 0 and 6');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.endTime) || entry.startTime >= entry.endTime) throw new Error('Schedule times are invalid');
      await conn.execute(`INSERT INTO doctor_schedules (id, doctor_id, location_id, weekday, start_time, end_time, slot_duration, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), doctorId, entry.locationId, entry.weekday, entry.startTime, entry.endTime, Math.max(5, Math.min(240, Number(entry.slotDuration || 30))), entry.active === false ? 0 : 1, new Date().toISOString()]);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

export async function getDoctorSchedule(doctorId?: string) {
  await ensureMultiDoctorSchema();
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `SELECT s.id, s.doctor_id, d.name AS doctor_name, s.location_id, l.name AS location_name, s.weekday, s.start_time, s.end_time, s.slot_duration, s.active
     FROM doctor_schedules s JOIN clinic_doctors d ON d.id = s.doctor_id JOIN clinic_locations l ON l.id = s.location_id
     WHERE (? IS NULL OR s.doctor_id = ?) ORDER BY d.name, s.weekday, s.start_time`, [doctorId || null, doctorId || null]
  );
  return rows;
}
