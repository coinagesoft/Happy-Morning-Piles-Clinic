import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getLetterhead, isLetterheadCustomised, resetLetterhead, saveLetterhead } from '@/lib/letterhead';
import { CLINIC_INFO, normalizeLetterhead } from '@/lib/prescriptionTemplate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store' };

function unauthorized(error?: string) {
  return NextResponse.json({ error: error || 'Unauthorized access.' }, { status: 401 });
}

// GET /api/admin/prescriptions/letterhead -> current letterhead + the built-in defaults
export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  const [letterhead, customised] = await Promise.all([getLetterhead(), isLetterheadCustomised()]);
  return NextResponse.json({ letterhead, defaults: CLINIC_INFO, customised }, { headers: NO_STORE });
}

// PUT /api/admin/prescriptions/letterhead   body: { letterhead: {...} }
export async function PUT(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const candidate = normalizeLetterhead(body?.letterhead ?? body);
    if (!candidate.doctorName) {
      return NextResponse.json({ error: 'Doctor name is required.' }, { status: 400 });
    }
    if (!candidate.clinicName) {
      return NextResponse.json({ error: 'Clinic name is required.' }, { status: 400 });
    }
    const letterhead = await saveLetterhead(candidate);
    return NextResponse.json({ letterhead, customised: true }, { headers: NO_STORE });
  } catch (err) {
    console.error('[letterhead] save failed:', err);
    return NextResponse.json({ error: 'Failed to save letterhead.' }, { status: 500 });
  }
}

// DELETE /api/admin/prescriptions/letterhead -> back to the built-in default
export async function DELETE(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const letterhead = await resetLetterhead();
    return NextResponse.json({ letterhead, customised: false }, { headers: NO_STORE });
  } catch (err) {
    console.error('[letterhead] reset failed:', err);
    return NextResponse.json({ error: 'Failed to reset letterhead.' }, { status: 500 });
  }
}