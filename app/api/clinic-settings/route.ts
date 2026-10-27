import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getClinicSettings, saveClinicSettings } from '@/lib/clinicSettings';
import { getFastAppointments } from '@/lib/cache';
import { generateSlots, normalizeClinicSettings } from '@/lib/slots';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// Public: the booking form needs the slot grid.
export async function GET() {
  const settings = await getClinicSettings();
  return NextResponse.json(
    { settings, slots: generateSlots(settings) },
    { headers: NO_STORE }
  );
}

async function handleSave(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Unauthorized access.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { settings, error } = normalizeClinicSettings(body);
    if (!settings) {
      return NextResponse.json({ error }, { status: 400 });
    }

    await saveClinicSettings(settings);
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
        !generateSlots(settings, a.date).some((slot) => slot.value === a.time)
    ).length;

    return NextResponse.json(
      {
        message: 'Appointment settings saved successfully.',
        settings,
        slots,
        offGridCount,
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