'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DoctorOverride } from '@/lib/availability';
import { Appointment } from '@/lib/storage';
import { useClinicSettings } from '@/lib/useClinicSettings';
import { areAllSlotsOccupied } from '@/lib/slots';

interface ThemedDatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (dateIso: string) => void;
  minDate?: string; // "YYYY-MM-DD"
  label?: string;
  existingOverrides?: DoctorOverride[];
  appointments?: Appointment[];
  disabled?: boolean;
  className?: string;
  disableWeeklyOff?: boolean;
  disableDoctorLeaves?: boolean;
  disableFullyBooked?: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday', isSunday: true },
];

function formatDateDisplay(iso: string) {
  if (!iso) return { full: 'Select a Date', weekday: '', relative: '' };
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return { full: iso, weekday: '', relative: '' };

    const full = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const weekday = d.toLocaleDateString('en-IN', { weekday: 'long' });

    // Calculate relative day diff compared to today
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let relative = '';
    if (diffDays === 0) relative = 'Today';
    else if (diffDays === 1) relative = 'Tomorrow';
    else if (diffDays === 2) relative = 'In 2 days';
    else if (diffDays > 2 && diffDays <= 7) relative = `In ${diffDays} days`;
    else if (diffDays > 7) relative = `In ${Math.round(diffDays / 7)} wk`;

    return { full, weekday, relative };
  } catch {
    return { full: iso, weekday: '', relative: '' };
  }
}

export default function ThemedDatePicker({
  value,
  onChange,
  minDate,
  label = 'Target Date',
  existingOverrides = [],
  appointments = [],
  disabled = false,
  className = '',
  disableWeeklyOff = true,
  disableDoctorLeaves = true,
  disableFullyBooked = true,
}: ThemedDatePickerProps) {
  const { slotValues, step } = useClinicSettings();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Month & Year view state
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    if (minDate) {
      const d = new Date(`${minDate}T00:00:00`);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date();
  });

  // Sync viewDate when value changes from outside
  useEffect(() => {
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      if (!isNaN(d.getTime())) {
        setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const handlePrevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }, []);

  // Quick preset shortcuts
  const shortcuts = useMemo(() => {
    const list: { label: string; date: string }[] = [];
    const base = new Date();

    // 1. Tomorrow
    const tomorrow = new Date(base);
    tomorrow.setDate(base.getDate() + 1);
    const tomIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
      tomorrow.getDate()
    ).padStart(2, '0')}`;
    list.push({ label: 'Tomorrow', date: tomIso });

    // 2. Next Monday
    const nextMon = new Date(base);
    const day = base.getDay();
    const daysUntilNextMon = ((8 - day) % 7) || 7;
    nextMon.setDate(base.getDate() + daysUntilNextMon);
    const monIso = `${nextMon.getFullYear()}-${String(nextMon.getMonth() + 1).padStart(2, '0')}-${String(
      nextMon.getDate()
    ).padStart(2, '0')}`;
    list.push({ label: 'Next Mon', date: monIso });

    // 3. This Friday
    const thisFri = new Date(base);
    const daysUntilFri = (5 - day + 7) % 7 || 7;
    thisFri.setDate(base.getDate() + daysUntilFri);
    const friIso = `${thisFri.getFullYear()}-${String(thisFri.getMonth() + 1).padStart(2, '0')}-${String(
      thisFri.getDate()
    ).padStart(2, '0')}`;
    list.push({ label: 'This Fri', date: friIso });

    // 4. In 7 Days
    const in7 = new Date(base);
    in7.setDate(base.getDate() + 7);
    const in7Iso = `${in7.getFullYear()}-${String(in7.getMonth() + 1).padStart(2, '0')}-${String(
      in7.getDate()
    ).padStart(2, '0')}`;
    list.push({ label: 'In 7 Days', date: in7Iso });

    return list;
  }, []);

  // Calendar days grid calculation
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // Shift so Monday is 0 and Sunday is 6
    const leadingBlanks = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const days = [];

    for (let i = 0; i < leadingBlanks; i++) {
      days.push({ blank: true, key: `blank-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}`;
      const dayDate = new Date(`${iso}T00:00:00`);
      const isSunday = dayDate.getDay() === 0;
      const isPast = minDate ? iso < minDate : iso < todayIso;
      const isToday = iso === todayIso;
      const isSelected = iso === value;

      // Existing override check
      const override = existingOverrides.find((o) => o.date === iso);
      const isFullDayLeave = override?.type === 'full_day';

      // Check if every configured slot is occupied/booked
      let isFullyBooked = false;
      if (appointments && appointments.length > 0) {
        const activeAppts = appointments.filter((a) => a.date === iso && a.status !== 'cancelled');
        const blockedSlots = override?.type === 'specific_slots' ? (override.blockedSlots || []) : [];
        isFullyBooked = areAllSlotsOccupied(
          slotValues,
          activeAppts.map((a) => a.time),
          blockedSlots,
          step
        );
      }

      const isWeeklyOffDisabled = disableWeeklyOff && isSunday;
      const isLeaveDisabled = disableDoctorLeaves && isFullDayLeave;
      const isFullyBookedDisabled = disableFullyBooked && isFullyBooked;

      const isDisabled =
        isPast || isWeeklyOffDisabled || isLeaveDisabled || isFullyBookedDisabled || disabled;

      days.push({
        blank: false,
        key: iso,
        day,
        iso,
        isSunday,
        isPast,
        isToday,
        isSelected,
        override,
        isFullDayLeave,
        isFullyBooked,
        isWeeklyOffDisabled,
        isLeaveDisabled,
        isFullyBookedDisabled,
        isDisabled,
      });
    }

    return days;
  }, [
    viewYear,
    viewMonth,
    minDate,
    todayIso,
    value,
    existingOverrides,
    appointments,
    disabled,
    disableWeeklyOff,
    disableDoctorLeaves,
    disableFullyBooked,
    slotValues,
    step,
  ]);

  const display = useMemo(() => formatDateDisplay(value), [value]);

  const handleSelectDay = (iso: string) => {
    onChange(iso);
    setIsOpen(false);
  };

  return (
    <div className={`themed-datepicker-root ${className}`.trim()} ref={containerRef}>
      {label && (
        <label className="themed-datepicker-label" htmlFor="themed-date-trigger">
          {label}
        </label>
      )}

      {/* Interactive Trigger Input Box */}
      <button
        type="button"
        id="themed-date-trigger"
        className={`themed-datepicker-trigger ${isOpen ? 'active-open' : ''} ${
          disabled ? 'disabled' : ''
        }`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <div className="trigger-left">
          <div className="trigger-icon-box" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>

          <div className="trigger-text-wrap">
            <div className="trigger-date-primary">
              <span className="trigger-date-str">{display.full}</span>
              {display.relative && (
                <span className="trigger-relative-pill">{display.relative}</span>
              )}
            </div>
            <div className="trigger-date-sub">
              {display.weekday ? `${display.weekday} • Target Consultation Date` : 'Click to select date'}
            </div>
          </div>
        </div>

        <div className="trigger-right">
          <span className="trigger-action-pill">Change Date</span>
          <div className={`trigger-chevron ${isOpen ? 'chevron-rotated' : ''}`} aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </button>

      {/* Custom MediTro Calendar Popover */}
      {isOpen && (
        <div className="themed-datepicker-popover" role="dialog" aria-label="Select target date">
          {/* Top Month/Year Header */}
          <div className="tdp-header">
            <div className="tdp-title-wrap">
              <span className="tdp-month-name">{MONTH_NAMES[viewMonth]}</span>
              <span className="tdp-year-name">{viewYear}</span>
            </div>

            <div className="tdp-nav-actions">
              <button
                type="button"
                className="tdp-nav-btn"
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                title="Previous Month"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <button
                type="button"
                className="tdp-nav-btn"
                onClick={handleNextMonth}
                aria-label="Next Month"
                title="Next Month"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick Shortcuts Bar */}
          <div className="tdp-shortcuts-bar">
            <span className="tdp-shortcuts-title">Quick Select:</span>
            <div className="tdp-shortcuts-chips">
              {shortcuts.map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  className={`tdp-shortcut-chip ${value === sc.date ? 'active' : ''}`}
                  onClick={() => handleSelectDay(sc.date)}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekday Row */}
          <div className="tdp-weekdays" role="row">
            {WEEKDAY_NAMES.map((wd) => (
              <div
                key={wd.short}
                className={`tdp-weekday ${wd.isSunday ? 'sunday' : ''}`}
                title={wd.full}
              >
                {wd.short}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="tdp-days-grid" role="grid">
            {calendarDays.map((item) => {
              if (item.blank) {
                return (
                  <div key={item.key} className="tdp-day-cell blank" aria-hidden="true" />
                );
              }

              const {
                iso,
                day,
                isSunday,
                isPast,
                isToday,
                isSelected,
                override,
                isLeaveDisabled,
                isWeeklyOffDisabled,
                isFullyBookedDisabled,
                isDisabled,
              } = item;

              const isOverrideActive = Boolean(override);

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`tdp-day-cell ${isSelected ? 'selected' : ''} ${
                    isDisabled ? 'past-disabled' : 'selectable'
                  } ${isSunday ? 'sunday' : ''} ${isToday ? 'today' : ''} ${
                    isOverrideActive ? 'has-override' : ''
                  } ${isWeeklyOffDisabled ? 'sunday-disabled' : ''} ${
                    isLeaveDisabled ? 'leave-disabled' : ''
                  } ${isFullyBookedDisabled ? 'booked-disabled' : ''}`}
                  disabled={isDisabled}
                  onClick={() => !isDisabled && iso && handleSelectDay(iso)}
                  title={
                    isPast
                      ? 'Cannot select past date'
                      : isWeeklyOffDisabled
                      ? 'Clinic closed on Sundays (Weekly Off)'
                      : isLeaveDisabled
                      ? `Doctor on leave: ${override?.reason || 'Unavailable'}`
                      : isFullyBookedDisabled
                      ? 'All appointments are fully booked on this date'
                      : isOverrideActive
                      ? `Active override: ${override?.reason || 'Doctor unavailable'}`
                      : `${day} ${MONTH_NAMES[viewMonth]} ${viewYear}`
                  }
                  aria-selected={isSelected}
                >
                  <span className="tdp-day-number">{day}</span>

                  {isToday && <span className="tdp-badge-today">Today</span>}

                  {isWeeklyOffDisabled && !isSelected && (
                    <span className="tdp-badge-closed">Closed</span>
                  )}

                  {isLeaveDisabled && !isSelected && (
                    <span className="tdp-badge-leave">Leave</span>
                  )}

                  {isFullyBookedDisabled && !isSelected && !isWeeklyOffDisabled && !isLeaveDisabled && (
                    <span className="tdp-badge-full">Full</span>
                  )}

                  {isOverrideActive && !isLeaveDisabled && !isSelected && (
                    <span
                      className={`tdp-override-dot ${
                        override?.type === 'full_day' ? 'dot-full' : 'dot-slots'
                      }`}
                      title={override?.type === 'full_day' ? 'Full day blackout' : 'Partial slots blocked'}
                    />
                  )}

                  {isSelected && (
                    <span className="tdp-check-mark" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Popover Footer */}
          <div className="tdp-footer">
            <div className="tdp-footer-summary">
              <span className="tdp-legend-dot dot-selected" />
              <span>
                Selected: <strong>{display.full}</strong> ({display.weekday || 'Chosen'})
              </span>
            </div>

            <button
              type="button"
              className="tdp-btn-close"
              onClick={() => setIsOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}