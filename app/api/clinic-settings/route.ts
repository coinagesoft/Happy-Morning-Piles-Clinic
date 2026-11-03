import { NextRequest, NextResponse } from 'next/server';
import { getScopedDoctorSlug, verifyAdminRequest } from '@/lib/adminAuth';
import { getClinicSettings, saveClinicSettings } from '@/lib/clinicSettings';
import { getFastAppointments } from '@/lib/cache';
import { getDoctorBySlug } from '@/lib/doctorsTeam';
import { generateSlots, normalizeClinicSettings } from '@/lib/slots';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/**
 * Which doctor's timings does this request mean?
 * - ?doctor=<slug>   -> that doctor
 * - ?doctor=default  -> the clinic defaults (no doctor chosen)
 * - nothing          -> a doctor login gets their own timings, everyone else the clinic defaults
 */
function resolveDoctor(request: NextRequest): { slug?: string; error?: string } {
  const param = request.nextUrl.searchParams.get('doctor')?.trim() || '';
  if (param === 'default') return {};
  if (param) {
    const doctor = getDoctorBySlug(param);
    if (!doctor) return { error: 'Unknown doctor.' };
    return { slug: doctor.slug };
  }
  const auth = verifyAdminRequest(request);
  return { slug: auth.authenticated ? getScopedDoctorSlug(auth.payload) : undefined };
}

// Public: the booking form needs the slot grid of the doctor the patient picked.
export async function GET(request: NextRequest) {
  const doctor = resolveDoctor(request);
  if (doctor.error) {
    return NextResponse.json({ error: doctor.error }, { status: 400 });
  }
  const settings = await getClinicSettings(doctor.slug);
  return NextResponse.json(
    { settings, slots: generateSlots(settings), doctorSlug: doctor.slug || null },
    { headers: NO_STORE }
  );
}

async function handleSave(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['doctor', 'admin']);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access.' },
      { status: auth.statusCode || 401 }
    );
  }

  // A doctor login can only ever save their OWN timings. Admin may pick a doctor with ?doctor=<slug>
  // (or save the clinic defaults when no doctor is given).
  const scoped = getScopedDoctorSlug(auth.payload);
  let targetSlug: string | undefined = scoped;
  if (!scoped) {
    const requested = request.nextUrl.searchParams.get('doctor')?.trim() || '';
    if (requested && requested !== 'default') {
      const doctor = getDoctorBySlug(requested);
      if (!doctor) {
        return NextResponse.json({ error: 'Unknown doctor.' }, { status: 400 });
      }
      targetSlug = doctor.slug;
    }
  }

  try {
    const body = await request.json();
    const { settings, error } = normalizeClinicSettings(body);
    if (!settings) {
      return NextResponse.json({ error }, { status: 400 });
    }

    await saveClinicSettings(settings, targetSlug);
    const slots = generateSlots(settings);

    // Warn about upcoming bookings that don't sit on the new slot grid.
    const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
      new Date()
    );
    const appointments = await getFastAppointments(true);
    const offGridCount = appointments.filter(
      (a) =>
        a.status !== 'cancelled' &&
        a.date >= todayIst &&
        (targetSlug ? a.doctorSlug === targetSlug : true) &&
        !generateSlots(settings, a.date).some((slot) => slot.value === a.time)
    ).length;

    return NextResponse.json(
      {
        message: 'Appointment settings saved successfully.',
        settings,
        slots,
        offGridCount,
        doctorSlug: targetSlug || null,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error('Error saving clinic settings:', err);
    const detail = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: detail ? `Failed to save appointment settings: ${detail}` : 'Failed to save appointment settings.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return handleSave(request);
}

export async function POST(request: NextRequest) {
  return handleSave(request);
}