import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export type AdminRole = 'super_admin' | 'admin' | 'doctor' | 'receptionist' | 'pharmacist';

export interface AdminUserConfig {
  id: string;
  email: string;
  password: string;
  name: string;
  role: AdminRole;
  title: string;
}

export const ADMIN_USERS: AdminUserConfig[] = [
  ...(process.env.SUPER_ADMIN_PASSWORD ? [{
    id: 'user-super-admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@clinic.local',
    password: process.env.SUPER_ADMIN_PASSWORD,
    name: 'Super Admin',
    role: 'super_admin' as AdminRole,
    title: 'Clinic System Administrator',
  }] : []),
  {
    id: 'user-doctor-1',
    email: 'shivrajrbabar@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'Coinage@1790',
    name: 'Dr. Mahesh Shete',
    role: 'doctor',
    title: 'Consulting Doctor (Full Clinical Access)',
  },
  {
    id: 'user-doctor-2',
    email: 'doctor@gmail.com',
    password: 'doctor@123',
    name: 'Dr. Mahesh Shete',
    role: 'doctor',
    title: 'Consulting Doctor (Full Clinical Access)',
  },
  {
    id: 'user-receptionist-1',
    email: 'receptionist@gmail.com',
    password: 'recep@123',
    name: 'Front Desk Receptionist',
    role: 'receptionist',
    title: 'Front Desk & Patient Care Coordinator',
  },
  {
    id: 'user-pharmacist-1',
    email: 'pharmacist@gmail.com',
    password: 'pharm@123',
    name: 'Clinic Pharmacist',
    role: 'pharmacist',
    title: 'Pharmacy & Remedy Dispensary Manager',
  },
];

export const ADMIN_EMAIL = ADMIN_USERS[0].email;
export const ADMIN_PASSWORD = ADMIN_USERS[0].password;

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

export function findUserByCredentials(email: string, password: string): AdminUserConfig | null {
  const cleanEmail = (email || '').trim().toLowerCase();
  const inputPass = String(password || '');

  for (const user of ADMIN_USERS) {
    if (user.email.toLowerCase() === cleanEmail) {
      const inputPassBuf = Buffer.from(inputPass);
      const expectedPassBuf = Buffer.from(user.password);
      if (
        inputPassBuf.length === expectedPassBuf.length &&
        crypto.timingSafeEqual(inputPassBuf, expectedPassBuf)
      ) {
        return user;
      }
    }
  }

  return null;
}

export function validateAdminCredentials(email: string, password: string): boolean {
  return findUserByCredentials(email, password) !== null;
}

export function generateAdminTokenPair(
  userConfig?: AdminUserConfig | { sub?: string; email: string; name: string; role: AdminRole }
) {
  const targetUser = userConfig || ADMIN_USERS[0];
  const sub =
    'sub' in targetUser && targetUser.sub
      ? targetUser.sub
      : 'id' in targetUser && targetUser.id
      ? targetUser.id
      : 'user-admin-1';

  const baseUser = {
    sub,
    email: targetUser.email,
    name: targetUser.name,
    role: targetUser.role,
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
    const isAllowed = allowedRoles.includes(userRole as AdminRole) || userRole === 'admin' || userRole === 'super_admin';
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
