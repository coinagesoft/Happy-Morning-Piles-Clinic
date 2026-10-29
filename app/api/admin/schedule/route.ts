import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getDoctorSchedule, replaceDoctorSchedule, ensureMultiDoctorSchema } from '@/lib/multiDoctor';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['super_admin', 'admin', 'doctor', 'receptionist']);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 });
  try {
    const requestedDoctorId = request.nextUrl.searchParams.get('doctorId') || undefined;
    const doctorId = auth.payload?.role === 'doctor' ? auth.payload.sub : requestedDoctorId;
    return NextResponse.json({ schedule: await getDoctorSchedule(doctorId) });
  } catch (error) {
    console.error('Get schedule failed:', error);
    return NextResponse.json({ error: 'Could not load doctor schedule.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['super_admin', 'doctor']);
  if (!auth.authenticated) return NextResponse.json({ error: 'Only a super admin or doctor can update a schedule.' }, { status: auth.statusCode || 403 });
  try {
    await ensureMultiDoctorSchema();
    const body = await request.json();
    const doctorId = auth.payload?.role === 'doctor' ? auth.payload.sub : String(body.doctorId || '');
    if (!doctorId) return NextResponse.json({ error: 'Doctor is required.' }, { status: 400 });
    if (!Array.isArray(body.entries)) return NextResponse.json({ error: 'Schedule entries must be an array.' }, { status: 400 });
    if (body.entries.length > 50) return NextResponse.json({ error: 'Too many schedule entries.' }, { status: 400 });
    await replaceDoctorSchedule(doctorId, body.entries);
    return NextResponse.json({ success: true, schedule: await getDoctorSchedule(doctorId) });
  } catch (error) {
    console.error('Save schedule failed:', error);
    return NextResponse.json({ error: String((error as Error)?.message || 'Could not save schedule.') }, { status: 400 });
  }
}
