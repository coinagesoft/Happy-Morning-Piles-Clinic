import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { runReminderJob } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not set on the server.' }, { status: 500 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const dryRun = sp.get('dryRun') === '1';
  const at = dryRun ? sp.get('at') || undefined : undefined;

  try {
    const result = await runReminderJob({ dryRun, at });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/reminders] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reminder job failed' },
      { status: 500 }
    );
  }
}

export { handle as GET, handle as POST };