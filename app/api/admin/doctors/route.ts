import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { createDoctor, createLocation, listDoctors, listLocations, getDoctorSchedule, replaceDoctorSchedule } from '@/lib/multiDoctor';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['super_admin', 'admin', 'doctor', 'receptionist']);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 });
  try {
    const [doctors, locations] = await Promise.all([listDoctors(), listLocations()]);
    const schedule = await getDoctorSchedule(auth.payload?.role === 'doctor' ? auth.payload.sub : undefined);
    return NextResponse.json({ doctors, locations, schedule });
  } catch (error) {
    console.error('List doctors failed:', error);
    return NextResponse.json({ error: 'Could not load doctors and locations.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['super_admin']);
  if (!auth.authenticated) return NextResponse.json({ error: 'Only the super admin can add doctors or clinic locations.' }, { status: auth.statusCode || 403 });
  try {
    const body = await request.json();
    if (body.action === 'location') {
      const name = String(body.name || '').trim();
      if (name.length < 2) return NextResponse.json({ error: 'Location name must be at least 2 characters.' }, { status: 400 });
      const location = await createLocation(name, String(body.address || ''));
      return NextResponse.json({ location }, { status: 201 });
    }
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2) return NextResponse.json({ error: 'Doctor name must be at least 2 characters.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid doctor email.' }, { status: 400 });
    if (password.length < 10) return NextResponse.json({ error: 'Doctor password must be at least 10 characters.' }, { status: 400 });
    const doctor = await createDoctor({ name, email, password, locationId: body.locationId || null });
    if (Array.isArray(body.schedule) && body.schedule.length) await replaceDoctorSchedule(doctor.id, body.schedule);
    return NextResponse.json({ doctor }, { status: 201 });
  } catch (error) {
    const message = String((error as Error)?.message || 'Could not create doctor.');
    if (/duplicate entry/i.test(message)) return NextResponse.json({ error: 'A staff account with this email already exists.' }, { status: 409 });
    console.error('Create doctor/location failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
