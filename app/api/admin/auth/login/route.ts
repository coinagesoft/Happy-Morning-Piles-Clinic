import { NextRequest, NextResponse } from 'next/server';
import {
  validateAdminCredentials,
  generateAdminTokenPair,
  setAuthCookies,
} from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Please enter both your email address and password.' },
        { status: 400 }
      );
    }

    const isValid = validateAdminCredentials(String(email), String(password));
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid admin email or password. Access denied.' },
        { status: 401 }
      );
    }

    const { accessToken, refreshToken, expiresIn, user } = generateAdminTokenPair();

    const response = NextResponse.json(
      {
        authenticated: true,
        message: 'Successfully signed in to Admin Portal.',
        accessToken,
        refreshToken,
        expiresIn,
        user,
      },
      { status: 200 }
    );

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (err) {
    console.error('Admin login error:', err);
    return NextResponse.json(
      { error: 'Unable to process login request.' },
      { status: 500 }
    );
  }
}

