import type { NextRequest } from 'next/server';

/**
 * Returns the public application base URL.
 * Automatically resolves to Vercel production domain, Vercel preview domain,
 * or the incoming request host if NEXT_PUBLIC_APP_URL is not set or set to localhost in production.
 */
export function getAppUrl(req?: NextRequest | Request | string): string {
  // If an explicit string URL / origin is passed
  if (typeof req === 'string' && req.trim()) {
    const trimmed = req.trim().replace(/\/$/, '');
    if (!trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
      return trimmed;
    }
    if (process.env.NODE_ENV !== 'production') {
      return trimmed;
    }
  }

  // If a request object is passed, extract origin
  if (req && typeof req === 'object' && 'url' in req) {
    try {
      const url = new URL(req.url);
      if (url.origin && !url.origin.includes('localhost') && !url.origin.includes('127.0.0.1')) {
        return url.origin;
      }
    } catch {
      // ignore
    }
  }

  // If in browser
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // Check Vercel production / deployment environment variables
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Check NEXT_PUBLIC_APP_URL
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    const cleaned = envUrl.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production' && cleaned.includes('localhost')) {
      if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
      }
    }
    return cleaned;
  }

  return 'http://localhost:3000';
}

