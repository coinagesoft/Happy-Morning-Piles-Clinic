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
 */
let current: ClinicSettings = DEFAULT_CLINIC_SETTINGS;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setClinicSettingsCache(next: ClinicSettings) {
  current = next;
  loaded = true;
  notify();
}

async function loadClinicSettings(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  inflight = fetch(`/api/clinic-settings?t=${Date.now()}`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.settings) setClinicSettingsCache(data.settings as ClinicSettings);
    })
    .catch((err) => console.error('Failed to load appointment settings:', err))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useClinicSettings(): {
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

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    if (!loaded) void loadClinicSettings();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const settings = current;
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
    reload: () => loadClinicSettings(true),
  };
}