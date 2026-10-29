import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { ensureMultiDoctorSchema } from '@/lib/multiDoctor';
import { getPool } from '@/lib/db';
import { invalidateAppointmentsCache } from '@/lib/cache';
import type { RowDataPacket } from 'mysql2/promise';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['super_admin', 'admin', 'receptionist', 'doctor']);
  if (!auth.authenticated || !auth.payload) return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 });
  try {
    await ensureMultiDoctorSchema();
    const body = await request.json();
    const appointmentId = String(body.appointmentId || '').trim();
    let doctorId = String(body.doctorId || '').trim();
    if (!appointmentId) return NextResponse.json({ error: 'Appointment ID is required.' }, { status: 400 });
    if (auth.payload.role === 'doctor') {
      doctorId = auth.payload.sub; // doctors may only self-assign
    } else if (!['super_admin', 'admin', 'receptionist'].includes(auth.payload.role)) {
      return NextResponse.json({ error: 'You cannot assign appointments.' }, { status: 403 });
    }
    if (!doctorId) return NextResponse.json({ error: 'Choose a doctor to assign.' }, { status: 400 });
    const pool = getPool();
    const [doctors] = await pool.execute<RowDataPacket[]>(`SELECT d.id, d.name, d.location_id, l.name AS primary_location FROM clinic_doctors d LEFT JOIN clinic_locations l ON l.id = d.location_id WHERE d.id = ? AND d.active = 1 LIMIT 1`, [doctorId]);
    if (!doctors.length) return NextResponse.json({ error: 'Active doctor not found.' }, { status: 404 });
    const [appointments] = await pool.execute<RowDataPacket[]>(`SELECT id, assigned_doctor_id, appointment_date, appointment_time FROM appointments WHERE id = ? LIMIT 1`, [appointmentId]);
    if (!appointments.length) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
    const currentDoctor = appointments[0].assigned_doctor_id as string | null;
    if (auth.payload.role === 'doctor' && currentDoctor && currentDoctor !== auth.payload.sub) {
      return NextResponse.json({ error: 'This patient is already assigned to another doctor. Ask reception or the super admin to reassign.' }, { status: 403 });
    }
    const [matchingSchedule] = await pool.execute<RowDataPacket[]>(
      `SELECT l.name AS location_name FROM doctor_schedules s JOIN clinic_locations l ON l.id = s.location_id WHERE s.doctor_id = ? AND s.active = 1 AND s.weekday = (DAYOFWEEK(?) - 1) AND ? >= s.start_time AND ? < s.end_time ORDER BY s.start_time LIMIT 1`,
      [doctorId, appointments[0].appointment_date, appointments[0].appointment_time, appointments[0].appointment_time]
    );
    const location = matchingSchedule[0]?.location_name || doctors[0].primary_location || null;
    await pool.execute(`UPDATE appointments SET assigned_doctor_id = ?, assigned_by_user_id = ?, assigned_at = ?, location = COALESCE(?, location) WHERE id = ?`, [doctorId, auth.payload.sub, new Date().toISOString(), location, appointmentId]);
    invalidateAppointmentsCache();
    return NextResponse.json({ success: true, appointmentId, assignedDoctorId: doctorId, assignedDoctorName: doctors[0].name, location });
  } catch (error) {
    console.error('Assign appointment failed:', error);
    return NextResponse.json({ error: 'Could not assign appointment.' }, { status: 500 });
  }
}
