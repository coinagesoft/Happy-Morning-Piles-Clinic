import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const ADMIN_EMAIL = 'shivrajrbabar@gmail.com';
export const ADMIN_PASSWORD = 'Coinage@1790';

const JWT_SECRET =
  process.env.ADMIN_JWT_SECRET ||
  process.env.GOOGLE_CLIENT_SECRET ||
  'dr-aarav-clinic-jwt-secret-key-2026-telehealth';

export const ACCESS_TOKEN_COOKIE = 'admin_access_token';
export const REFRESH_TOKEN_COOKIE = 'admin_refresh_token';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AdminTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: 'admin';
  type: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export function signJwtToken(
  payload: Omit<AdminTokenPayload, 'iat' | 'exp' | 'jti'>,
  ttlSeconds: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AdminTokenPayload = {
    ...payload,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${signingInput}.${encodedSignature}`;
}

export function verifyJwtToken(
  token: string,
  expectedType?: 'access' | 'refresh'
): AdminTokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = base64UrlEncode(
      crypto.createHmac('sha256', JWT_SECRET).update(signingInput).digest()
    );

    const sigBuffer = Buffer.from(encodedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AdminTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp < now) {
      return null;
    }

    if (expectedType && payload.type !== expectedType) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function generateAdminTokenPair() {
  const baseUser = {
    sub: 'doctor-admin-1',
    email: ADMIN_EMAIL,
    name: 'Dr. Mahesh Shete',
    role: 'admin' as const,
  };

  const accessToken = signJwtToken(
    { ...baseUser, type: 'access' },
    ACCESS_TOKEN_TTL_SECONDS
  );

  const refreshToken = signJwtToken(
    { ...baseUser, type: 'refresh' },
    REFRESH_TOKEN_TTL_SECONDS
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      email: baseUser.email,
      name: baseUser.name,
      role: baseUser.role,
    },
  };
}

export function validateAdminCredentials(email: string, password: string): boolean {
  const cleanEmail = (email || '').trim().toLowerCase();
  const expectedEmail = ADMIN_EMAIL.toLowerCase();

  if (cleanEmail !== expectedEmail) {
    return false;
  }

  const inputPassBuf = Buffer.from(password || '');
  const expectedPassBuf = Buffer.from(ADMIN_PASSWORD);

  if (inputPassBuf.length !== expectedPassBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(inputPassBuf, expectedPassBuf);
}

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string
): void {
  const isProd = process.env.NODE_ENV === 'production';

  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
}

export function verifyAdminRequest(request: NextRequest): {
  authenticated: boolean;
  payload?: AdminTokenPayload;
  error?: string;
} {
  // 1. Check Authorization: Bearer <token> header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    const verified = verifyJwtToken(bearerToken, 'access');
    if (verified) return { authenticated: true, payload: verified };
  }

  // 2. Check HttpOnly access token cookie
  const cookieAccess = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (cookieAccess) {
    const verified = verifyJwtToken(cookieAccess, 'access');
    if (verified) return { authenticated: true, payload: verified };
  }

  // 3. Fallback: Check HttpOnly refresh token cookie so valid sessions stay seamless
  const cookieRefresh = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (cookieRefresh) {
    const verified = verifyJwtToken(cookieRefresh, 'refresh');
    if (verified) return { authenticated: true, payload: verified };
  }

  return {
    authenticated: false,
    error: 'Unauthorized: Valid admin access token required.',
  };
}
