import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getWhatsAppStatus, logoutWhatsApp } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET -> connection status (+ QR code image while waiting to be linked)
export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Unauthorized access.' }, { status: 401 });
  }
  const status = await getWhatsAppStatus();
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}

// DELETE -> unlink the clinic WhatsApp
export async function DELETE(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Unauthorized access.' }, { status: 401 });
  }
  await logoutWhatsApp();
  return NextResponse.json({ success: true });
}