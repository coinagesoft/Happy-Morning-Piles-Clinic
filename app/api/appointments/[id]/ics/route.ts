import { NextRequest, NextResponse } from 'next/server';
import { getAppointmentById } from '@/lib/storage';
import { generateIcsContent } from '@/lib/google';
import { getClinicSettings } from '@/lib/clinicSettings';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const appointment = await getAppointmentById(id);

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const { slotDuration } = await getClinicSettings();
  const ics = generateIcsContent(appointment, slotDuration);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="consultation-${appointment.date}.ics"`,
    },
  });
}