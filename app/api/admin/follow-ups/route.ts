import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { listFollowUps } from '@/lib/prescriptions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/admin/follow-ups  - follow-up dates set on prescriptions (used by the Patient Directory)
export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Unauthorized access.' }, { status: 401 });
  }
  try {
    const followUps = await listFollowUps();
    return NextResponse.json({ followUps });
  } catch (err) {
    console.error('[follow-ups] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load follow-ups.' }, { status: 500 });
  }
}