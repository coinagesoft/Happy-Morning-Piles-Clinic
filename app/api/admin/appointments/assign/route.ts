import { NextRequest, NextResponse } from 'next/server';
import { getAllAppointments, getAppointmentById, updateAppointment } from '@/lib/storage';
import { verifyAdminRequest, type AdminRole } from '@/lib/adminAuth';
import {
  checkDoctorForAppointment,
  getDoctorById,
  getDoctorFromToken,
  listDoctors,
} from '@/lib/doctors';

export const dynamic = 'force-dynamic';

// Receptionist assigns, doctor self-assigns, super admin ("admin") can do both.
const ALLOWED: AdminRole[] = ['receptionist', 'doctor', 'admin'];

function deny(auth: ReturnType<typeof verifyAdminRequest>) {
  return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 401 });
}

/**
 * GET ?appointmentId=...  ->  active doctors with "available" + a reason when not available.
 * Used by the receptionist's "Assign Doctor" dialog.
 */
export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request, ALLOWED);
  if (!auth.authenticated) return deny(auth);

  try {
    const appointmentId = request.nextUrl.searchParams.get('appointmentId') || '';
    const appointment = appointmentId ? await getAppointmentById(appointmentId) : null;
    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
    }

    const [doctors, all] = await Promise.all([listDoctors(), getAllAppointments(true)]);
    const result = doctors
      .filter((d) => d.isActive)
      .map((d) => {
        const check = checkDoctorForAppointment(d, appointment, all);
        return {
          id: d.id,
          name: d.name,
          specialization: d.specialization,
          locations: d.locations,
          available: check.available,
          reason: check.reason,
        };
      })
      // Available doctors first
      .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));

    return NextResponse.json({
      doctors: result,
      assignedDoctorId: appointment.doctorId || null,
    });
  } catch (err) {
    console.error('Load assignable doctors error:', err);
    return NextResponse.json({ error: 'Failed to load doctors.' }, { status: 500 });
  }
}

/**
 * POST { appointmentId, doctorId }  -> receptionist / super admin assigns (doctorId null = unassign)
 * POST { appointmentId, self: true } -> a doctor takes the patient (self: false = release)
 */
export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request, ALLOWED);
  if (!auth.authenticated || !auth.payload) return deny(auth);
  const role = auth.payload.role;

  try {
    const body = await request.json();
    const appointmentId = String(body.appointmentId || '');
    const appointment = appointmentId ? await getAppointmentById(appointmentId) : null;
    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
    }

    let targetDoctorId: string | null;

    // Doctors can only act on themselves. A Super Admin who is also a doctor may do the
    // same by sending `self`.
    const selfMode = role === 'doctor' || (role === 'admin' && typeof body.self === 'boolean');

    if (selfMode) {
      const me = await getDoctorFromToken(auth.payload);
      if (!me) {
        return NextResponse.json(
          {
            error:
              role === 'admin'
                ? 'Add yourself as a doctor in the Doctors tab first.'
                : 'Your login is not linked to a doctor profile. Ask the Super Admin to add you in the Doctors tab.',
          },
          { status: 403 }
        );
      }
      if (!me.isActive) {
        return NextResponse.json({ error: 'Your doctor account is inactive.' }, { status: 403 });
      }

      if (body.self === false) {
        if (appointment.doctorId !== me.id) {
          return NextResponse.json({ error: 'This patient is not assigned to you.' }, { status: 403 });
        }
        targetDoctorId = null;
      } else {
        if (appointment.doctorId && appointment.doctorId !== me.id) {
          return NextResponse.json(
            { error: `Already assigned to ${appointment.doctorName || 'another doctor'}.` },
            { status: 409 }
          );
        }
        targetDoctorId = me.id;
      }
    } else {
      targetDoctorId = body.doctorId ? String(body.doctorId) : null;
    }

    // Unassign
    if (!targetDoctorId) {
      const updated = await updateAppointment(appointment.id, {
        doctorId: undefined,
        doctorName: undefined,
      });
      return NextResponse.json({ appointment: updated, message: 'Doctor unassigned.' });
    }

    if (appointment.status !== 'confirmed') {
      return NextResponse.json(
        { error: 'Only confirmed appointments can be assigned to a doctor.' },
        { status: 400 }
      );
    }

    const doctor = await getDoctorById(targetDoctorId);
    if (!doctor) return NextResponse.json({ error: 'Doctor not found.' }, { status: 404 });

    // Availability check (active, sits at this location, no clash at the same time)
    const all = await getAllAppointments(true);
    const check = checkDoctorForAppointment(doctor, appointment, all);
    if (!check.available) {
      return NextResponse.json(
        { error: `${doctor.name} is not available: ${check.reason}.` },
        { status: 409 }
      );
    }

    const updated = await updateAppointment(appointment.id, {
      doctorId: doctor.id,
      doctorName: doctor.name,
    });
    return NextResponse.json({ appointment: updated, message: `Assigned to ${doctor.name}.` });
  } catch (err) {
    console.error('Assign doctor error:', err);
    const detail =
      process.env.NODE_ENV !== 'production' && err instanceof Error ? ` (${err.message})` : '';
    return NextResponse.json({ error: `Failed to assign doctor.${detail}` }, { status: 500 });
  }
}