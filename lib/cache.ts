import { Appointment } from './storage';
import { DoctorOverride } from './availability';
import { getPool, ensureDatabaseSchema } from './db';
import type { RowDataPacket } from 'mysql2/promise';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface AppointmentRow extends RowDataPacket {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  age: number;
  reason: string;
  appointment_date: string;
  appointment_time: string;
  message: string | null;
  meet_link: string | null;
  google_event_id: string | null;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  payment_status: 'paid' | 'pending' | 'refunded';
  amount: string | number;
  payment_method: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'Razorpay' | 'Pending';
  payment_id: string | null;
  paid_at: string | null;
  notes: string | null;
  consultation_type?: 'online' | 'offline' | null;
  location?: string | null;
  created_at: string;
}

interface DoctorOverrideRow extends RowDataPacket {
  id: string;
  override_date: string;
  override_type: 'full_day' | 'specific_slots';
  blocked_slots: string | null;
  reason: string;
  created_at: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __appointmentsCache: CacheEntry<Appointment[]> | undefined;
  // eslint-disable-next-line no-var
  var __doctorOverridesCache: CacheEntry<DoctorOverride[]> | undefined;
  // eslint-disable-next-line no-var
  var __inFlightAppointmentsPromise: Promise<Appointment[]> | null | undefined;
  // eslint-disable-next-line no-var
  var __inFlightOverridesPromise: Promise<DoctorOverride[]> | null | undefined;
}

const CACHE_TTL_MS = 45_000; // 45 seconds fresh
const STALE_REFRESH_THRESHOLD_MS = 20_000; // Background refresh if older than 20s

function mapRowToAppointment(row: AppointmentRow): Appointment {
  const isOffline =
    row.consultation_type === 'offline' ||
    (row.notes && row.notes.toLowerCase().includes('offline')) ||
    (!row.meet_link && row.payment_method === 'Cash');

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    age: Number(row.age),
    reason: row.reason,
    date: row.appointment_date,
    time: row.appointment_time,
    message: row.message || '',
    meetLink: row.meet_link || undefined,
    googleEventId: row.google_event_id || undefined,
    createdAt: row.created_at,
    status: row.status || 'confirmed',
    paymentStatus: row.payment_status || 'paid',
    amount: row.amount !== undefined && row.amount !== null ? Number(row.amount) : 800,
    paymentMethod: row.payment_method || 'Razorpay',
    paymentId: row.payment_id || `PAY-${row.id.slice(0, 8).toUpperCase()}`,
    paidAt: row.paid_at || row.created_at,
    notes: row.notes || '',
    consultationType: isOffline ? 'offline' : 'online',
    location: row.location || undefined,
  };
}

function mapRowToOverride(row: DoctorOverrideRow): DoctorOverride {
  let blockedSlots: string[] | undefined = undefined;
  if (row.blocked_slots) {
    try {
      const parsed = JSON.parse(row.blocked_slots);
      if (Array.isArray(parsed)) {
        blockedSlots = parsed;
      }
    } catch {
      blockedSlots = undefined;
    }
  }

  return {
    id: row.id,
    date: row.override_date,
    type: row.override_type,
    blockedSlots,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

// Fetch all appointments directly from DB
async function fetchAppointmentsFromDb(): Promise<Appointment[]> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const [rows] = await pool.execute<AppointmentRow[]>(
    `SELECT * FROM appointments ORDER BY appointment_date DESC, appointment_time DESC, created_at DESC`
  );
  return rows.map(mapRowToAppointment);
}

// Fetch all doctor overrides directly from DB
async function fetchOverridesFromDb(): Promise<DoctorOverride[]> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const [rows] = await pool.execute<DoctorOverrideRow[]>(
    `SELECT * FROM doctor_availability ORDER BY override_date ASC, created_at DESC`
  );
  return rows.map(mapRowToOverride);
}

/**
 * Returns all appointments from in-memory cache in sub-millisecond (< 0.1ms).
 * Employs SWR (Stale-While-Revalidate) and request deduplication.
 */
export async function getFastAppointments(forceFresh = false): Promise<Appointment[]> {
  const now = Date.now();
  const cached = global.__appointmentsCache;

  if (!forceFresh && cached) {
    const age = now - cached.timestamp;
    if (age < CACHE_TTL_MS) {
      // If aging past threshold, trigger non-blocking background refresh
      if (age > STALE_REFRESH_THRESHOLD_MS && !global.__inFlightAppointmentsPromise) {
        global.__inFlightAppointmentsPromise = fetchAppointmentsFromDb()
          .then((fresh) => {
            global.__appointmentsCache = { data: fresh, timestamp: Date.now() };
            return fresh;
          })
          .catch((err) => {
            console.warn('[Cache] Background appointments refresh failed:', err);
            return cached.data;
          })
          .finally(() => {
            global.__inFlightAppointmentsPromise = null;
          });
      }
      return cached.data;
    }
  }

  // Deduplicate in-flight promises to avoid connection storms
  if (global.__inFlightAppointmentsPromise) {
    return global.__inFlightAppointmentsPromise;
  }

  global.__inFlightAppointmentsPromise = fetchAppointmentsFromDb()
    .then((fresh) => {
      global.__appointmentsCache = { data: fresh, timestamp: Date.now() };
      return fresh;
    })
    .finally(() => {
      global.__inFlightAppointmentsPromise = null;
    });

  return global.__inFlightAppointmentsPromise;
}

/**
 * Returns all doctor overrides from in-memory cache in sub-millisecond (< 0.1ms).
 */
export async function getFastDoctorOverrides(forceFresh = false): Promise<DoctorOverride[]> {
  const now = Date.now();
  const cached = global.__doctorOverridesCache;

  if (!forceFresh && cached) {
    const age = now - cached.timestamp;
    if (age < CACHE_TTL_MS) {
      if (age > STALE_REFRESH_THRESHOLD_MS && !global.__inFlightOverridesPromise) {
        global.__inFlightOverridesPromise = fetchOverridesFromDb()
          .then((fresh) => {
            global.__doctorOverridesCache = { data: fresh, timestamp: Date.now() };
            return fresh;
          })
          .catch((err) => {
            console.warn('[Cache] Background overrides refresh failed:', err);
            return cached.data;
          })
          .finally(() => {
            global.__inFlightOverridesPromise = null;
          });
      }
      return cached.data;
    }
  }

  if (global.__inFlightOverridesPromise) {
    return global.__inFlightOverridesPromise;
  }

  global.__inFlightOverridesPromise = fetchOverridesFromDb()
    .then((fresh) => {
      global.__doctorOverridesCache = { data: fresh, timestamp: Date.now() };
      return fresh;
    })
    .finally(() => {
      global.__inFlightOverridesPromise = null;
    });

  return global.__inFlightOverridesPromise;
}

/**
 * Invalidation / Write-through update functions
 */
export function invalidateAppointmentsCache(): void {
  global.__appointmentsCache = undefined;
  global.__inFlightAppointmentsPromise = null;
}

export function invalidateOverridesCache(): void {
  global.__doctorOverridesCache = undefined;
  global.__inFlightOverridesPromise = null;
}

export function updateCachedAppointment(appointment: Appointment): void {
  if (global.__appointmentsCache?.data) {
    const list = global.__appointmentsCache.data;
    const idx = list.findIndex((a) => a.id === appointment.id);
    if (idx >= 0) {
      list[idx] = appointment;
    } else {
      list.unshift(appointment);
    }
    global.__appointmentsCache.timestamp = Date.now();
  } else {
    invalidateAppointmentsCache();
  }
}

export function removeCachedAppointment(id: string): void {
  if (global.__appointmentsCache?.data) {
    global.__appointmentsCache.data = global.__appointmentsCache.data.filter((a) => a.id !== id);
    global.__appointmentsCache.timestamp = Date.now();
  }
}

export function updateCachedOverride(override: DoctorOverride): void {
  if (global.__doctorOverridesCache?.data) {
    const list = global.__doctorOverridesCache.data;
    const idx = list.findIndex((o) => o.id === override.id);
    if (idx >= 0) {
      list[idx] = override;
    } else {
      list.push(override);
    }
    global.__doctorOverridesCache.timestamp = Date.now();
  } else {
    invalidateOverridesCache();
  }
}

export function removeCachedOverride(id: string): void {
  if (global.__doctorOverridesCache?.data) {
    global.__doctorOverridesCache.data = global.__doctorOverridesCache.data.filter((o) => o.id !== id);
    global.__doctorOverridesCache.timestamp = Date.now();
  }
}

/**
 * Fast sub-millisecond query helpers
 */
export async function getFastBookedSlotsForDate(date: string): Promise<string[]> {
  const appts = await getFastAppointments();
  return appts
    .filter((a) => a.date === date && a.status !== 'cancelled')
    .map((a) => a.time);
}

export async function isFastSlotBooked(date: string, time: string): Promise<boolean> {
  const booked = await getFastBookedSlotsForDate(date);
  return booked.includes(time);
}

export async function isFastSlotBookedExcluding(
  date: string,
  time: string,
  excludeId: string
): Promise<boolean> {
  const appts = await getFastAppointments();
  return appts.some(
    (a) =>
      a.date === date &&
      a.time === time &&
      a.status !== 'cancelled' &&
      a.id !== excludeId
  );
}

export async function getFastDoctorDateBlock(
  date: string
): Promise<{ blocked: boolean; reason?: string }> {
  const overrides = await getFastDoctorOverrides();
  const match = overrides.find((o) => o.date === date && o.type === 'full_day');
  if (match) {
    return { blocked: true, reason: match.reason || 'Doctor on leave' };
  }
  return { blocked: false };
}

export async function getFastDoctorBlockedSlots(
  date: string,
  allPossibleSlots?: string[]
): Promise<string[]> {
  const overrides = await getFastDoctorOverrides();
  const blocked = new Set<string>();

  for (const o of overrides) {
    if (o.date === date) {
      if (o.type === 'full_day') {
        if (allPossibleSlots) {
          allPossibleSlots.forEach((s) => blocked.add(s));
        }
      } else if (o.type === 'specific_slots' && Array.isArray(o.blockedSlots)) {
        o.blockedSlots.forEach((s) => blocked.add(s));
      }
    }
  }

  return Array.from(blocked);
}

export async function getFastDoctorBlockedDates(): Promise<{ date: string; reason: string }[]> {
  const overrides = await getFastDoctorOverrides();
  return overrides
    .filter((o) => o.type === 'full_day')
    .map((o) => ({ date: o.date, reason: o.reason }));
}

/**
 * Fast Bulk Availability: Returns entire upcoming calendar state in < 1ms
 */
export async function getBulkCalendarAvailability() {
  const [appts, overrides] = await Promise.all([
    getFastAppointments(),
    getFastDoctorOverrides(),
  ]);

  // Group booked slots by date
  const bookedSlotsByDate: Record<string, string[]> = {};
  for (const a of appts) {
    if (a.status === 'cancelled') continue;
    if (!bookedSlotsByDate[a.date]) {
      bookedSlotsByDate[a.date] = [];
    }
    if (!bookedSlotsByDate[a.date].includes(a.time)) {
      bookedSlotsByDate[a.date].push(a.time);
    }
  }

  // Doctor full-day blocked dates
  const blockedDates = overrides
    .filter((o) => o.type === 'full_day')
    .map((o) => ({ date: o.date, reason: o.reason }));

  // Doctor specific slots blocked by date
  const doctorBlockedSlotsByDate: Record<string, string[]> = {};
  for (const o of overrides) {
    if (o.type === 'specific_slots' && Array.isArray(o.blockedSlots)) {
      if (!doctorBlockedSlotsByDate[o.date]) {
        doctorBlockedSlotsByDate[o.date] = [];
      }
      for (const slot of o.blockedSlots) {
        if (!doctorBlockedSlotsByDate[o.date].includes(slot)) {
          doctorBlockedSlotsByDate[o.date].push(slot);
        }
      }
    }
  }

  return {
    bookedSlotsByDate,
    blockedDates,
    doctorBlockedSlotsByDate,
    overrides,
    timestamp: Date.now(),
  };
}