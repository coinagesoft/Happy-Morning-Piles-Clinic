import { NextResponse } from 'next/server';
import { isGoogleConnected, DOCTOR_EMAIL } from '@/lib/google';
import { getGoogleConfig } from '@/lib/storage';

export async function GET() {
  const config = getGoogleConfig();
  const hasConfig = Boolean(config?.clientId && config?.clientSecret);
  const connected = isGoogleConnected();

  return NextResponse.json({
    connected,
    hasConfig,
    doctorEmail: DOCTOR_EMAIL,
  });
}
