/**
 * Runs once when the Next.js server starts.
 * Starts the built-in reminder scheduler when ENABLE_INTERNAL_CRON=true
 * (use this on a VPS / `npm start`; otherwise call /api/cron/reminders from an external cron).
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    (process.env.ENABLE_INTERNAL_CRON || '').toLowerCase() === 'true'
  ) {
    const { startReminderScheduler } = await import('./lib/reminders');
    startReminderScheduler();
  }
}
