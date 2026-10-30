import { NextRequest, NextResponse } from 'next/server';
import {
  findUserByCredentials,
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

    const matchedUser = await findUserByCredentials(String(email), String(password));
    if (!matchedUser) {
      return NextResponse.json(
        { error: 'Invalid login credentials. Please check your email and password.' },
        { status: 401 }
      );
    }

    const { accessToken, refreshToken, expiresIn, user } = generateAdminTokenPair(matchedUser);

    const response = NextResponse.json(
      {
        authenticated: true,
        message: `Welcome ${matchedUser.name}! Signed in as ${matchedUser.role}.`,
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