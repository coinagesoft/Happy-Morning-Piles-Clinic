import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getAppointmentById } from '@/lib/storage';
import {
  getPrescriptionByAppointment,
  savePrescription,
  getMedicineSuggestions,
} from '@/lib/prescriptions';
import type { PrescriptionMedicine } from '@/lib/prescriptionTemplate';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function unauthorized(error?: string) {
  return NextResponse.json({ error: error || 'Unauthorized access.' }, { status: 401 });
}

// GET /api/admin/prescriptions?appointmentId=...
export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const appointmentId = request.nextUrl.searchParams.get('appointmentId') || '';
    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId is required.' }, { status: 400 });
    }
    const [prescription, suggestions] = await Promise.all([
      getPrescriptionByAppointment(appointmentId),
      getMedicineSuggestions(),
    ]);
    return NextResponse.json({ prescription, suggestions });
  } catch (err) {
    console.error('[prescriptions] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load prescription.' }, { status: 500 });
  }
}

function cleanMedicine(m: Partial<PrescriptionMedicine>): PrescriptionMedicine {
  const timing = m.timing === 'before' || m.timing === 'after' || m.timing === 'with' ? m.timing : 'any';
  return {
    name: String(m.name || '').trim().slice(0, 200),
    potency: String(m.potency || '').trim().slice(0, 50),
    quantity: String(m.quantity || '').trim().slice(0, 100),
    morning: Boolean(m.morning),
    afternoon: Boolean(m.afternoon),
    night: Boolean(m.night),
    timing,
    duration: String(m.duration || '').trim().slice(0, 100),
    instructions: String(m.instructions || '').trim().slice(0, 500),
  };
}

// POST /api/admin/prescriptions  — create or update the prescription for an appointment
export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const appointmentId = String(body.appointmentId || '');
    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId is required.' }, { status: 400 });
    }

    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
    }

    const medicines = (Array.isArray(body.medicines) ? body.medicines : [])
      .map(cleanMedicine)
      .filter((m: PrescriptionMedicine) => m.name);

    if (medicines.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one medicine before saving.' },
        { status: 400 }
      );
    }

    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
      new Date()
    );

    const prescription = await savePrescription({
      appointmentId,
      patientName: appointment.fullName,
      patientEmail: appointment.email,
      patientPhone: appointment.phone,
      patientAge: appointment.age,
      date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayIso,
      diagnosis: String(body.diagnosis || '').slice(0, 2000),
      medicines,
      advice: String(body.advice || '').slice(0, 4000),
      followUp: String(body.followUp || '').slice(0, 255),
    });

    return NextResponse.json({ prescription });
  } catch (err) {
    console.error('[prescriptions] POST failed:', err);
    return NextResponse.json({ error: 'Failed to save prescription.' }, { status: 500 });
  }
}