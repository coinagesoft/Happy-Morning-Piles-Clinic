import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { findStaffByCredentials } from './adminUsers';

export type AdminRole = 'admin' | 'doctor' | 'receptionist' | 'pharmacist';

export interface AdminUserConfig {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  title: string;
  /** Only for role "doctor": which doctor in lib/doctorsTeam.ts this login belongs to. */
  doctorSlug?: string;
}

/**
 * Staff logins live in the `admin_users` table (create them with scripts/create-admin-user.mjs).
 * Optional break-glass admin: set ADMIN_EMAIL + ADMIN_PASSWORD (and ADMIN_NAME) in the environment.
 */
function envAdminUser(email: string, password: string): AdminUserConfig | null {
  const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD || '';
  if (!envEmail || !envPassword || email !== envEmail) return null;

  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(envPassword).digest();
  if (!crypto.timingSafeEqual(a, b)) return null;

  return {
    id: 'env-admin',
    email: envEmail,
    name: (process.env.ADMIN_NAME || '').trim() || 'Clinic Admin',
    role: 'admin',
    title: 'Administrator',
  };
}

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
  role: AdminRole;
  doctorSlug?: string;
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

export async function findUserByCredentials(
  email: string,
  password: string
): Promise<AdminUserConfig | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const inputPass = String(password || '');
  if (!cleanEmail || !inputPass || inputPass.length > 256) return null;

  const envUser = envAdminUser(cleanEmail, inputPass);
  if (envUser) return envUser;

  return findStaffByCredentials(cleanEmail, inputPass);
}

export function generateAdminTokenPair(
  userConfig:
    | AdminUserConfig
    | { sub?: string; email: string; name: string; role: AdminRole; doctorSlug?: string }
) {
  const sub =
    'sub' in userConfig && userConfig.sub
      ? userConfig.sub
      : 'id' in userConfig && userConfig.id
      ? userConfig.id
      : 'user-admin-1';

  const doctorSlug = userConfig.doctorSlug || undefined;
  const baseUser = {
    sub,
    email: userConfig.email,
    name: userConfig.name,
    role: userConfig.role,
    ...(doctorSlug ? { doctorSlug } : {}),
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
      doctorSlug,
    },
  };
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

export function verifyAdminRequest(
  request: NextRequest,
  allowedRoles?: AdminRole[]
): {
  authenticated: boolean;
  payload?: AdminTokenPayload;
  error?: string;
  statusCode?: number;
} {
  let verifiedPayload: AdminTokenPayload | null = null;

  // 1. Check Authorization: Bearer <token> header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    verifiedPayload = verifyJwtToken(bearerToken, 'access');
  }

  // 2. Check HttpOnly access token cookie
  if (!verifiedPayload) {
    const cookieAccess = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    if (cookieAccess) {
      verifiedPayload = verifyJwtToken(cookieAccess, 'access');
    }
  }

  // 3. Fallback: Check HttpOnly refresh token cookie
  if (!verifiedPayload) {
    const cookieRefresh = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    if (cookieRefresh) {
      verifiedPayload = verifyJwtToken(cookieRefresh, 'refresh');
    }
  }

  if (!verifiedPayload) {
    return {
      authenticated: false,
      error: 'Unauthorized: Valid admin access token required.',
      statusCode: 401,
    };
  }

  // Role verification (if allowedRoles specified)
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = verifiedPayload.role || 'admin';
    const isAllowed = allowedRoles.includes(userRole) || userRole === 'admin';
    if (!isAllowed) {
      return {
        authenticated: false,
        error: `Forbidden: Role "${userRole}" does not have permission for this action.`,
        statusCode: 403,
      };
    }
  }

  return { authenticated: true, payload: verifiedPayload };
}

// ---------------------------------------------------------------------------
// Doctor scoping helpers
// ---------------------------------------------------------------------------

/** The doctor slug when the caller is a doctor login tied to one doctor; otherwise undefined. */
export function getScopedDoctorSlug(payload?: AdminTokenPayload): string | undefined {
  return payload && payload.role === 'doctor' && payload.doctorSlug ? payload.doctorSlug : undefined;
}

/** Admin, receptionist (and an old-style doctor login with no doctor attached) may assign any doctor. */
export function canAssignAnyDoctor(payload?: AdminTokenPayload): boolean {
  if (!payload) return false;
  if (payload.role === 'admin' || payload.role === 'receptionist') return true;
  return payload.role === 'doctor' && !payload.doctorSlug;
}

/** Can the caller SEE this appointment? Doctors see their own patients plus unassigned ones. */
export function canViewAppointment(
  payload: AdminTokenPayload | undefined,
  appt: { doctorSlug?: string | null }
): boolean {
  const scoped = getScopedDoctorSlug(payload);
  if (!scoped) return true;
  return !appt.doctorSlug || appt.doctorSlug === scoped;
}

/** Can the caller CHANGE this appointment (status, notes, prescription, delete)? */
export function canManageAppointment(
  payload: AdminTokenPayload | undefined,
  appt: { doctorSlug?: string | null }
): boolean {
  const scoped = getScopedDoctorSlug(payload);
  if (!scoped) return true;
  return appt.doctorSlug === scoped;
}