import { NextRequest, NextResponse } from 'next/server';
import {
  REFRESH_TOKEN_COOKIE,
  verifyJwtToken,
  generateAdminTokenPair,
  setAuthCookies,
  clearAuthCookies,
} from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    let incomingRefreshToken = '';
    try {
      const body = await request.json();
      if (body && typeof body.refreshToken === 'string') {
        incomingRefreshToken = body.refreshToken.trim();
      }
    } catch {
      // No JSON body provided; fall back to HttpOnly cookie
    }

    if (!incomingRefreshToken) {
      incomingRefreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value || '';
    }

    if (!incomingRefreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required.' },
        { status: 401 }
      );
    }

    const verified = verifyJwtToken(incomingRefreshToken, 'refresh');
    if (!verified) {
      const res = NextResponse.json(
        { error: 'Invalid or expired refresh token. Please sign in again.' },
        { status: 401 }
      );
      clearAuthCookies(res);
      return res;
    }

    const { accessToken, refreshToken, expiresIn, user } = generateAdminTokenPair(verified);

    const response = NextResponse.json(
      {
        authenticated: true,
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
    console.error('Admin token refresh error:', err);
    return NextResponse.json(
      { error: 'Failed to refresh access token.' },
      { status: 500 }
    );
  }
}
