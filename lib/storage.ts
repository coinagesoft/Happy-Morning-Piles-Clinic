import type { RowDataPacket } from 'mysql2/promise';
import type { Credentials } from 'google-auth-library';
import { getPool, ensureDatabaseSchema } from './db';
import {
  getFastAppointments,
  updateCachedAppointment,
  removeCachedAppointment,
  getFastBookedSlotsForDate,
  isFastSlotBooked,
  isFastSlotBookedExcluding,
} from './cache';

export interface Appointment {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  age: number;
  reason: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  message?: string;
  meetLink?: string;
  googleEventId?: string;
  createdAt: string;
  // Status & Payment Management
  status?: 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  paymentStatus?: 'paid' | 'pending' | 'refunded';
  amount?: number; // In INR, default: 800
  paymentMethod?: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'Razorpay' | 'Pending';
  paymentId?: string;
  paidAt?: string;
  notes?: string;
  consultationType?: 'online' | 'offline';
  /** Where the doctor is sitting for this appointment (from the day-wise schedule). */
  location?: string;
}

interface AppointmentRow extends RowDataPacket {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  age: number;
  reason: string;
  appointment_date: string;
  appointment_time: string;
  message: string | null;
  meet_link: string | null;
  google_event_id: string | null;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  payment_status: 'paid' | 'pending' | 'refunded';
  amount: string | number;
  payment_method: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'Razorpay' | 'Pending';
  payment_id: string | null;
  paid_at: string | null;
  notes: string | null;
  consultation_type?: 'online' | 'offline' | null;
  location?: string | null;
  created_at: string;
}

let inMemoryTokens: Credentials | null = null;

function mapRowToAppointment(row: AppointmentRow): Appointment {
  const isOffline =
    row.consultation_type === 'offline' ||
    (row.notes && row.notes.toLowerCase().includes('offline')) ||
    (!row.meet_link && row.payment_method === 'Cash');

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    age: Number(row.age),
    reason: row.reason,
    date: row.appointment_date,
    time: row.appointment_time,
    message: row.message || '',
    meetLink: row.meet_link || undefined,
    googleEventId: row.google_event_id || undefined,
    createdAt: row.created_at,
    status: row.status || 'confirmed',
    paymentStatus: row.payment_status || 'paid',
    amount: row.amount !== undefined && row.amount !== null ? Number(row.amount) : 800,
    paymentMethod: row.payment_method || 'Razorpay',
    paymentId: row.payment_id || `PAY-${row.id.slice(0, 8).toUpperCase()}`,
    paidAt: row.paid_at || row.created_at,
    notes: row.notes || '',
    consultationType: isOffline ? 'offline' : 'online',
    location: row.location || undefined,
  };
}

async function syncPatientAndPaymentTables(appt: Appointment): Promise<void> {
  const pool = getPool();
  const cleanEmail = appt.email.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const paymentId = appt.paymentId || `PAY-${appt.id.slice(0, 8).toUpperCase()}`;
  const amount = typeof appt.amount === 'number' ? appt.amount : 800;
  const paymentMethod = appt.paymentMethod || 'Razorpay';
  const paymentStatus = appt.paymentStatus || 'paid';
  const paidAt = appt.paidAt || appt.createdAt || nowIso;

  // 1. Upsert into payments table
  await pool.execute(
    `INSERT INTO payments (
      payment_id, appointment_id, patient_name, patient_email, patient_phone,
      amount, payment_method, payment_status, paid_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      patient_name = VALUES(patient_name),
      patient_email = VALUES(patient_email),
      patient_phone = VALUES(patient_phone),
      amount = VALUES(amount),
      payment_method = VALUES(payment_method),
      payment_status = VALUES(payment_status),
      paid_at = VALUES(paid_at)`,
    [
      paymentId,
      appt.id,
      appt.fullName,
      cleanEmail,
      appt.phone,
      amount,
      paymentMethod,
      paymentStatus,
      paidAt,
    ]
  );

  // 2. Recalculate aggregate patient stats from appointments table for this email
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      COUNT(*) AS totalBookings,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN amount ELSE 0 END), 0) AS totalPaid,
      MAX(appointment_date) AS lastVisitDate
    FROM appointments
    WHERE LOWER(email) = ?`,
    [cleanEmail]
  );

  const stats = rows[0] || { totalBookings: 1, totalPaid: amount, lastVisitDate: appt.date };

  await pool.execute(
    `INSERT INTO patients (
      email, full_name, phone, age, total_bookings, total_paid, last_visit_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      age = VALUES(age),
      total_bookings = VALUES(total_bookings),
      total_paid = VALUES(total_paid),
      last_visit_date = VALUES(last_visit_date),
      updated_at = VALUES(updated_at)`,
    [
      cleanEmail,
      appt.fullName,
      appt.phone,
      appt.age,
      Number(stats.totalBookings) || 1,
      Number(stats.totalPaid) || 0,
      stats.lastVisitDate || appt.date,
      appt.createdAt || nowIso,
      nowIso,
    ]
  );
}

export async function getAllAppointments(forceFresh = false): Promise<Appointment[]> {
  return getFastAppointments(forceFresh);
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const [rows] = await pool.execute<AppointmentRow[]>(
    `SELECT * FROM appointments WHERE id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  return mapRowToAppointment(rows[0]);
}

export async function saveAppointment(appointment: Appointment): Promise<Appointment> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const status = appointment.status || 'confirmed';
  const paymentStatus = appointment.paymentStatus || 'paid';
  const amount = typeof appointment.amount === 'number' ? appointment.amount : 800;
  const paymentMethod = appointment.paymentMethod || 'Razorpay';
  const paymentId = appointment.paymentId || `PAY-${appointment.id.slice(0, 8).toUpperCase()}`;
  const paidAt = appointment.paidAt || appointment.createdAt;
  const notes = appointment.notes || '';
  const consultationType = appointment.consultationType || 'online';

  await pool.execute(
    `INSERT INTO appointments (
      id, full_name, phone, email, age, reason,
      appointment_date, appointment_time, message, meet_link, google_event_id,
      status, payment_status, amount, payment_method, payment_id, paid_at, notes, consultation_type, location, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      email = VALUES(email),
      age = VALUES(age),
      reason = VALUES(reason),
      appointment_date = VALUES(appointment_date),
      appointment_time = VALUES(appointment_time),
      message = VALUES(message),
      meet_link = VALUES(meet_link),
      google_event_id = VALUES(google_event_id),
      status = VALUES(status),
      payment_status = VALUES(payment_status),
      amount = VALUES(amount),
      payment_method = VALUES(payment_method),
      payment_id = VALUES(payment_id),
      paid_at = VALUES(paid_at),
      notes = VALUES(notes),
      consultation_type = VALUES(consultation_type),
      location = VALUES(location)`,
    [
      appointment.id,
      appointment.fullName,
      appointment.phone,
      appointment.email,
      appointment.age,
      appointment.reason,
      appointment.date,
      appointment.time,
      appointment.message || '',
      appointment.meetLink || null,
      appointment.googleEventId || null,
      status,
      paymentStatus,
      amount,
      paymentMethod,
      paymentId,
      paidAt,
      notes,
      consultationType,
      appointment.location || null,
      appointment.createdAt,
    ]
  );

  const saved: Appointment = {
    ...appointment,
    status,
    paymentStatus,
    amount,
    paymentMethod,
    paymentId,
    paidAt,
    notes,
    consultationType,
  };

  updateCachedAppointment(saved);
  await syncPatientAndPaymentTables(saved);
  return saved;
}

export async function updateAppointment(
  id: string,
  updates: Partial<Appointment>
): Promise<Appointment | null> {
  await ensureDatabaseSchema();
  const existing = await getAppointmentById(id);
  if (!existing) return null;

  const updated: Appointment = {
    ...existing,
    ...updates,
    id,
  };

  await saveAppointment(updated);
  return updated;
}

export async function deleteAppointment(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const existing = await getAppointmentById(id);

  await pool.execute(`DELETE FROM payments WHERE appointment_id = ?`, [id]);
  await pool.execute(`DELETE FROM prescriptions WHERE appointment_id = ?`, [id]);
  await pool.execute(`DELETE FROM appointments WHERE id = ?`, [id]);
  removeCachedAppointment(id);

  if (existing) {
    const cleanEmail = existing.email.trim().toLowerCase();
    const [remaining] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM appointments WHERE LOWER(email) = ?`,
      [cleanEmail]
    );
    if (!remaining[0] || Number(remaining[0].cnt) === 0) {
      await pool.execute(`DELETE FROM patients WHERE email = ?`, [cleanEmail]);
    } else {
      const [latestRows] = await pool.execute<AppointmentRow[]>(
        `SELECT * FROM appointments WHERE LOWER(email) = ? ORDER BY appointment_date DESC LIMIT 1`,
        [cleanEmail]
      );
      if (latestRows.length > 0) {
        await syncPatientAndPaymentTables(mapRowToAppointment(latestRows[0]));
      }
    }
  }

  return true;
}

export async function getBookedSlotsForDate(date: string): Promise<string[]> {
  return getFastBookedSlotsForDate(date);
}

export async function isSlotBooked(date: string, time: string): Promise<boolean> {
  return isFastSlotBooked(date, time);
}

export async function isSlotBookedExcluding(
  date: string,
  time: string,
  excludeId: string
): Promise<boolean> {
  return isFastSlotBookedExcluding(date, time, excludeId);
}

export function getGoogleTokens(): Credentials | null {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN.trim().replace(/^["']|["']$/g, '');
    let tokens: Credentials = {
      refresh_token: refreshToken,
      token_type: 'Bearer',
    };
    if (inMemoryTokens?.access_token) {
      tokens = { ...tokens, ...inMemoryTokens, refresh_token: refreshToken };
    }
    return tokens;
  }

  if (inMemoryTokens) {
    return inMemoryTokens;
  }

  return null;
}

export function saveGoogleTokens(tokens: Credentials): void {
  const existing = getGoogleTokens();
  const merged: Credentials = {
    ...existing,
    ...tokens,
    refresh_token:
      tokens.refresh_token ||
      existing?.refresh_token ||
      (process.env.GOOGLE_REFRESH_TOKEN
        ? process.env.GOOGLE_REFRESH_TOKEN.trim().replace(/^["']|["']$/g, '')
        : undefined),
  };
  inMemoryTokens = merged;

  // Persist asynchronously to MySQL google_oauth_tokens table
  const doctorEmail = process.env.DOCTOR_EMAIL || 'shivrajrbabar@gmail.com';
  ensureDatabaseSchema()
    .then(() => {
      const pool = getPool();
      return pool.execute(
        `INSERT INTO google_oauth_tokens (
          id, doctor_email, access_token, refresh_token, token_type, expiry_date, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          doctor_email = VALUES(doctor_email),
          access_token = VALUES(access_token),
          refresh_token = VALUES(refresh_token),
          token_type = VALUES(token_type),
          expiry_date = VALUES(expiry_date),
          updated_at = VALUES(updated_at)`,
        [
          doctorEmail,
          merged.access_token || null,
          merged.refresh_token || null,
          merged.token_type || 'Bearer',
          merged.expiry_date || null,
          new Date().toISOString(),
        ]
      );
    })
    .catch((err) => {
      console.warn('[db] Could not persist Google OAuth tokens to MySQL:', err);
    });
}

export function clearGoogleTokens(): void {
  inMemoryTokens = null;
  ensureDatabaseSchema()
    .then(() => {
      const pool = getPool();
      return pool.execute(`DELETE FROM google_oauth_tokens WHERE id = 1`);
    })
    .catch(() => {
      // ignore error
    });
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export function getGoogleConfig(): GoogleConfig | null {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const clientId = process.env.GOOGLE_CLIENT_ID.trim().replace(/^["']|["']$/g, '');
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET.trim().replace(/^["']|["']$/g, '');

    if (clientSecret.includes('Rm9_DwlZwTf')) {
      clientSecret = clientSecret.replace('Rm9_DwlZwTf', 'Rm9_DwLZwTf');
    }

    return {
      clientId,
      clientSecret,
    };
  }
  return null;
}

export function saveGoogleConfig(config: GoogleConfig): void {
  process.env.GOOGLE_CLIENT_ID = config.clientId;
  process.env.GOOGLE_CLIENT_SECRET = config.clientSecret;
}