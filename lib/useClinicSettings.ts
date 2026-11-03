'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ClinicSettings,
  ClinicSlot,
  DEFAULT_CLINIC_SETTINGS,
  generateSlots,
  getSlotStep,
  getClosedWeekdays,
  getSlotLocation,
  getBookableLocations,
  getLocations,
  isClinicClosedOn,
} from './slots';

/**
 * Tiny shared store so every component (patient booking form, admin calendar,
 * reschedule modal, availability manager ...) uses the same slot grid and
 * re-renders as soon as the admin saves new appointment settings.
 *
 * Timings are kept PER DOCTOR. The store key is the doctor slug:
 *  - a doctor slug  -> that doctor's timings
 *  - 'default'      -> the clinic defaults (no doctor chosen)
 *  - '' (omitted)   -> let the server decide: a doctor login gets their own timings,
 *                      everyone else the clinic defaults
 */
type Entry = { settings: ClinicSettings; loaded: boolean };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function keyOf(doctorSlug?: string | null): string {
  return (doctorSlug || '').trim();
}

function getEntry(key: string): Entry {
  return store.get(key) || { settings: DEFAULT_CLINIC_SETTINGS, loaded: false };
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function setClinicSettingsCache(next: ClinicSettings, doctorSlug?: string | null) {
  store.set(keyOf(doctorSlug), { settings: next, loaded: true });
  notify();
}

async function loadClinicSettings(key: string, force = false): Promise<void> {
  const running = inflight.get(key);
  if (running && !force) return running;
  const doctorQuery = key ? `&doctor=${encodeURIComponent(key)}` : '';
  const request = fetch(`/api/clinic-settings?t=${Date.now()}${doctorQuery}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.settings) setClinicSettingsCache(data.settings as ClinicSettings, key);
    })
    .catch((err) => console.error('Failed to load appointment settings:', err))
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

/** Reloads every timing set that is currently in memory (call after saving timings). */
export function refreshAllClinicSettings(): Promise<void[]> {
  return Promise.all(Array.from(store.keys()).map((key) => loadClinicSettings(key, true)));
}

export function useClinicSettings(doctorSlug?: string | null): {
  settings: ClinicSettings;
  slots: ClinicSlot[];
  slotValues: string[];
  step: number;
  /** Weekdays (0 = Sunday) with no timings. */
  closedWeekdays: number[];
  /** Every location the doctor added. */
  locations: string[];
  /** Locations with at least one open weekday (what patients can choose). */
  bookableLocations: string[];
  /** Weekdays (0 = Sunday) on which the doctor does not sit at a given location. */
  closedWeekdaysFor: (location: string) => number[];
  /** Slots of one specific date's weekday (empty when closed), optionally for one location. */
  slotsForDate: (date: string, location?: string) => ClinicSlot[];
  /** True when the doctor has no timings on that date's weekday (optionally at one location). */
  isClosedOn: (date: string, location?: string) => boolean;
  /** Location of the session containing `time` on `date`. */
  locationFor: (date: string, time: string) => string | undefined;
  isLoaded: boolean;
  reload: () => Promise<void>;
} {
  const [, setTick] = useState(0);
  const key = keyOf(doctorSlug);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    if (!getEntry(key).loaded) void loadClinicSettings(key);
    return () => {
      listeners.delete(listener);
    };
  }, [key]);

  const { settings, loaded } = getEntry(key);
  const slots = useMemo(() => generateSlots(settings), [settings]);
  const slotValues = useMemo(() => slots.map((s) => s.value), [slots]);

  return {
    settings,
    slots,
    slotValues,
    step: getSlotStep(settings),
    closedWeekdays: getClosedWeekdays(settings),
    locations: getLocations(settings),
    bookableLocations: getBookableLocations(settings),
    closedWeekdaysFor: (location: string) => getClosedWeekdays(settings, location),
    slotsForDate: (date: string, location?: string) =>
      date ? generateSlots(settings, date, location || undefined) : [],
    isClosedOn: (date: string, location?: string) =>
      date ? isClinicClosedOn(settings, date, location || undefined) : false,
    locationFor: (date: string, time: string) =>
      date && time ? getSlotLocation(settings, date, time) : undefined,
    isLoaded: loaded,
    reload: () => loadClinicSettings(key, true),
  };
}
