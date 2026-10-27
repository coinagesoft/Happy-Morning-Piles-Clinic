import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  verifyJwtToken,
  generateAdminTokenPair,
  setAuthCookies,
} from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. Check Authorization: Bearer <accessToken> header or cookie
  const authHeader = request.headers.get('authorization');
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const cookieAccess = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value || '';

  const accessCandidate = bearerToken || cookieAccess;
  if (accessCandidate) {
    const verifiedAccess = verifyJwtToken(accessCandidate, 'access');
    if (verifiedAccess) {
      return NextResponse.json({
        authenticated: true,
        accessToken: accessCandidate,
        user: {
          email: verifiedAccess.email,
          name: verifiedAccess.name,
          role: verifiedAccess.role,
        },
      });
    }
  }

  // 2. If access token expired or missing, check refresh token cookie and issue new token pair
  const cookieRefresh = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value || '';
  if (cookieRefresh) {
    const verifiedRefresh = verifyJwtToken(cookieRefresh, 'refresh');
    if (verifiedRefresh) {
      const { accessToken, refreshToken, expiresIn, user } = generateAdminTokenPair(verifiedRefresh);
      const response = NextResponse.json({
        authenticated: true,
        accessToken,
        refreshToken,
        expiresIn,
        user,
      });
      setAuthCookies(response, accessToken, refreshToken);
      return response;
    }
  }

  return NextResponse.json(
    { authenticated: false, error: 'Not authenticated.' },
    { status: 401 }
  );
}
