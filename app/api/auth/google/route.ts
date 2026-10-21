import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl, DOCTOR_EMAIL } from '@/lib/google';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const authUrl = getGoogleAuthUrl(redirectUri);

  if (!authUrl) {
    return NextResponse.json(
      {
        error:
          'Google OAuth credentials are not set in environment variables. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your project environment.',
        doctorEmail: DOCTOR_EMAIL,
      },
      { status: 400 }
    );
  }

  return NextResponse.redirect(authUrl);
}
