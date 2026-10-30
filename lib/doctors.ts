import crypto from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import type { Appointment } from './storage';

export interface Doctor {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  qualification: string;
  registrationNo: string;
  locations: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorInput {
  name: string;
  email: string;
  phone?: string;
  specialization?: string;
  qualification?: string;
  registrationNo?: string;
  locations?: string[];
  isActive?: boolean;
}

interface DoctorRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  phone: string;
  specialization: string;
  qualification: string;
  registration_no: string;
  locations: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export const MIN_PASSWORD_LENGTH = 6;

/* ---------- Password hashing (scrypt, no extra dependency) ---------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ---------- Mapping helpers ---------- */

function parseLocations(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((l) => String(l).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function cleanLocations(locations?: string[]): string[] {
  if (!Array.isArray(locations)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of locations) {
    const v = String(l || '').trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

function mapRow(row: DoctorRow): Doctor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    specialization: row.specialization || '',
    qualification: row.qualification || '',
    registrationNo: row.registration_no || '',
    locations: parseLocations(row.locations),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ---------- One-time import of the clinic's existing doctor ---------- */

const SEED_FLAG = 'seed_default_doctors_v1';
let defaultsEnsured = false;

/**
 * The clinic's original doctor login used to be hard-coded. Import it into the doctors
 * table exactly once, so it shows in the Doctors tab (editable / assignable). The flag
 * guarantees a doctor the Super Admin later deletes is not re-created.
 */
export async function ensureDefaultDoctors(): Promise<void> {
  if (defaultsEnsured) return;
  await ensureDatabaseSchema();
  const pool = getPool();
  const now = new Date().toISOString();

  const [flagResult] = await pool.execute(
    `INSERT IGNORE INTO app_flags (flag_key, created_at) VALUES (?, ?)`,
    [SEED_FLAG, now]
  );
  if ((flagResult as { affectedRows: number }).affectedRows === 1) {
    await pool.execute(
      `INSERT IGNORE INTO doctors (
        id, name, email, password_hash, phone, specialization, qualification,
        registration_no, locations, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', '', '', '', ?, 1, ?, ?)`,
      [
        `doc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        'Dr. Mahesh Shete',
        'shivrajrbabar@gmail.com',
        hashPassword(process.env.ADMIN_PASSWORD || 'Coinage@1790'),
        JSON.stringify([]),
        now,
        now,
      ]
    );
  }
  defaultsEnsured = true;
}

/* ---------- CRUD ---------- */

export async function listDoctors(): Promise<Doctor[]> {
  await ensureDefaultDoctors();
  const [rows] = await getPool().execute<DoctorRow[]>(
    `SELECT * FROM doctors ORDER BY is_active DESC, name ASC`
  );
  return rows.map(mapRow);
}

export async function getDoctorById(id: string): Promise<Doctor | null> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<DoctorRow[]>(`SELECT * FROM doctors WHERE id = ?`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getDoctorByEmail(email: string): Promise<Doctor | null> {
  await ensureDefaultDoctors();
  const [rows] = await getPool().execute<DoctorRow[]>(
    `SELECT * FROM doctors WHERE LOWER(email) = ?`,
    [email.trim().toLowerCase()]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createDoctor(input: DoctorInput, password: string): Promise<Doctor> {
  await ensureDatabaseSchema();
  const now = new Date().toISOString();
  const id = `doc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  await getPool().execute(
    `INSERT INTO doctors (
      id, name, email, password_hash, phone, specialization, qualification,
      registration_no, locations, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      hashPassword(password),
      (input.phone || '').trim(),
      (input.specialization || '').trim(),
      (input.qualification || '').trim(),
      (input.registrationNo || '').trim(),
      JSON.stringify(cleanLocations(input.locations)),
      input.isActive === false ? 0 : 1,
      now,
      now,
    ]
  );

  return (await getDoctorById(id)) as Doctor;
}

/** Updates a doctor. Pass `newPassword` only when the Super Admin wants to reset it. */
export async function updateDoctor(
  id: string,
  input: DoctorInput,
  newPassword?: string
): Promise<Doctor | null> {
  await ensureDatabaseSchema();
  const existing = await getDoctorById(id);
  if (!existing) return null;

  const fields = [
    'name = ?',
    'email = ?',
    'phone = ?',
    'specialization = ?',
    'qualification = ?',
    'registration_no = ?',
    'locations = ?',
    'is_active = ?',
    'updated_at = ?',
  ];
  const values: (string | number)[] = [
    input.name.trim(),
    input.email.trim().toLowerCase(),
    (input.phone ?? existing.phone).trim(),
    (input.specialization ?? existing.specialization).trim(),
    (input.qualification ?? existing.qualification).trim(),
    (input.registrationNo ?? existing.registrationNo).trim(),
    JSON.stringify(cleanLocations(input.locations ?? existing.locations)),
    (input.isActive ?? existing.isActive) ? 1 : 0,
    new Date().toISOString(),
  ];

  if (newPassword) {
    fields.push('password_hash = ?');
    values.push(hashPassword(newPassword));
  }

  await getPool().execute(`UPDATE doctors SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
  return getDoctorById(id);
}

export async function deleteDoctor(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const [result] = await getPool().execute(`DELETE FROM doctors WHERE id = ?`, [id]);
  return (result as { affectedRows: number }).affectedRows > 0;
}

/** Used by the login route: returns the doctor only if the password matches and the account is active. */
export async function verifyDoctorLogin(email: string, password: string): Promise<Doctor | null> {
  await ensureDefaultDoctors();
  const [rows] = await getPool().execute<DoctorRow[]>(
    `SELECT * FROM doctors WHERE LOWER(email) = ? AND is_active = 1`,
    [email.trim().toLowerCase()]
  );
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return mapRow(row);
}

/* ---------- Assignment helpers ---------- */

/**
 * Finds the doctor profile of the signed-in user, matched by login email. This works for
 * doctors and also for a Super Admin who has added themselves as a doctor.
 */
export async function getDoctorFromToken(payload: { email: string }): Promise<Doctor | null> {
  if (!payload.email) return null;
  return getDoctorByEmail(payload.email);
}

export interface DoctorAvailability {
  available: boolean;
  reason?: string;
}

/**
 * Can this doctor take this appointment?
 *  - the account must be active
 *  - the doctor must sit at the appointment's location (a doctor with no locations set can sit anywhere)
 *  - the doctor must not already have another appointment at the same date & time
 */
export function checkDoctorForAppointment(
  doctor: Doctor,
  appointment: Appointment,
  allAppointments: Appointment[]
): DoctorAvailability {
  if (!doctor.isActive) return { available: false, reason: 'Account is inactive' };

  if (appointment.location && doctor.locations.length > 0) {
    const sitsThere = doctor.locations.some(
      (l) => l.trim().toLowerCase() === appointment.location!.trim().toLowerCase()
    );
    if (!sitsThere) {
      return { available: false, reason: `Does not sit at ${appointment.location}` };
    }
  }

  const clash = allAppointments.find(
    (a) =>
      a.id !== appointment.id &&
      a.doctorId === doctor.id &&
      a.date === appointment.date &&
      a.time === appointment.time &&
      a.status !== 'cancelled'
  );
  if (clash) {
    return { available: false, reason: `Busy at ${appointment.time} (${clash.fullName})` };
  }

  return { available: true };
}