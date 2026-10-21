import type { RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';
import { getPool, ensureDatabaseSchema } from './db';
import type { Prescription, PrescriptionMedicine } from './prescriptionTemplate';

interface PrescriptionRow extends RowDataPacket {
  id: string;
  appointment_id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  patient_age: number;
  prescription_date: string;
  diagnosis: string | null;
  medicines: string | null;
  advice: string | null;
  follow_up: string | null;
  emailed_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseMedicines(raw: string | null): PrescriptionMedicine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRow(row: PrescriptionRow): Prescription {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    patientName: row.patient_name,
    patientEmail: row.patient_email,
    patientPhone: row.patient_phone,
    patientAge: Number(row.patient_age) || 0,
    date: row.prescription_date,
    diagnosis: row.diagnosis || '',
    medicines: parseMedicines(row.medicines),
    advice: row.advice || '',
    followUp: row.follow_up || '',
    emailedAt: row.emailed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPrescriptionByAppointment(
  appointmentId: string
): Promise<Prescription | null> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<PrescriptionRow[]>(
    `SELECT * FROM prescriptions WHERE appointment_id = ? LIMIT 1`,
    [appointmentId]
  );
  return rows.length ? mapRow(rows[0]) : null;
}

export async function getPrescriptionById(id: string): Promise<Prescription | null> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<PrescriptionRow[]>(
    `SELECT * FROM prescriptions WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length ? mapRow(rows[0]) : null;
}

export type PrescriptionInput = Omit<
  Prescription,
  'id' | 'createdAt' | 'updatedAt' | 'emailedAt'
>;

/** One prescription per appointment: creates it, or updates the existing one. */
export async function savePrescription(input: PrescriptionInput): Promise<Prescription> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const now = new Date().toISOString();
  const existing = await getPrescriptionByAppointment(input.appointmentId);
  const id = existing?.id || crypto.randomUUID();
  const medicines = JSON.stringify(input.medicines);

  await pool.execute(
    `INSERT INTO prescriptions (
      id, appointment_id, patient_name, patient_email, patient_phone, patient_age,
      prescription_date, diagnosis, medicines, advice, follow_up, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      patient_name = VALUES(patient_name),
      patient_email = VALUES(patient_email),
      patient_phone = VALUES(patient_phone),
      patient_age = VALUES(patient_age),
      prescription_date = VALUES(prescription_date),
      diagnosis = VALUES(diagnosis),
      medicines = VALUES(medicines),
      advice = VALUES(advice),
      follow_up = VALUES(follow_up),
      updated_at = VALUES(updated_at)`,
    [
      id,
      input.appointmentId,
      input.patientName,
      input.patientEmail,
      input.patientPhone,
      input.patientAge || 0,
      input.date,
      input.diagnosis,
      medicines,
      input.advice,
      input.followUp,
      existing?.createdAt || now,
      now,
    ]
  );

  return (await getPrescriptionById(id)) as Prescription;
}

export async function markPrescriptionEmailed(id: string): Promise<void> {
  await ensureDatabaseSchema();
  await getPool().execute(`UPDATE prescriptions SET emailed_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ]);
}

export async function deletePrescriptionsForAppointment(appointmentId: string): Promise<void> {
  await ensureDatabaseSchema();
  await getPool().execute(`DELETE FROM prescriptions WHERE appointment_id = ?`, [appointmentId]);
}

/** Medicine names from the medicine database + previously prescribed remedies — used for prescription type-ahead */
export async function getMedicineSuggestions(limit = 500): Promise<string[]> {
  await ensureDatabaseSchema();
  const pool = getPool();

  // 1. Fetch all medicine names from the medicines database
  let dbMedNames: string[] = [];
  try {
    const [medRows] = await pool.execute<RowDataPacket[]>(
      `SELECT name FROM medicines ORDER BY name ASC`
    );
    dbMedNames = (medRows as { name: string }[]).map((r) => r.name.trim()).filter(Boolean);
  } catch (err) {
    console.error('Failed to fetch medicine suggestions from db:', err);
  }

  // 2. Fetch past prescribed medicines to prioritize frequently prescribed
  const [rows] = await pool.execute<PrescriptionRow[]>(
    `SELECT medicines FROM prescriptions ORDER BY updated_at DESC LIMIT 100`
  );
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    parseMedicines(r.medicines).forEach((m) => {
      const name = (m.name || '').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
  });

  const prescribedSorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  // Combine: frequently prescribed first, then all medicines from DB, deduplicated
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of prescribedSorted) {
    const lower = name.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(name);
    }
  }

  for (const name of dbMedNames) {
    const lower = name.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(name);
    }
  }

  return result.slice(0, limit);
}
