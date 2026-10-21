import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    authenticated: false,
    message: 'Signed out successfully.',
  });
  clearAuthCookies(response);
  return response;
}

