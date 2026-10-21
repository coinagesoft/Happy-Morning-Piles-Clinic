'use client';

import React, { useState, useMemo, useEffect } from 'react';

interface CalendarPickerProps {
  selectedDate: string; // "YYYY-MM-DD"
  onSelectDate: (dateIso: string) => void;
  minDate: string; // "YYYY-MM-DD" (tomorrow)
  disabled?: boolean;
  doctorBlockedDates?: { date: string; reason: string }[];
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

const WEEKDAYS = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday', isSunday: true },
];

export default function CalendarPicker({
  selectedDate,
  onSelectDate,
  minDate,
  disabled = false,
  doctorBlockedDates = [],
}: CalendarPickerProps) {
  // Determine current today in YYYY-MM-DD
  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }, []);

  // View state: Year and Month
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (selectedDate) {
      const d = new Date(`${selectedDate}T00:00:00`);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    if (minDate) {
      const d = new Date(`${minDate}T00:00:00`);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date();
  });

  // Keep viewDate in sync if selectedDate changes from outside
  useEffect(() => {
    if (selectedDate) {
      const d = new Date(`${selectedDate}T00:00:00`);
      if (!isNaN(d.getTime())) {
        setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
  }, [selectedDate]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  // Earliest navigable month is the month of minDate or today
  const minNavDate = useMemo(() => {
    const d = minDate ? new Date(`${minDate}T00:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [minDate]);

  // Max navigable month is 3 months ahead
  const maxNavDate = useMemo(() => {
    const d = minDate ? new Date(`${minDate}T00:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth() + 3, 1);
  }, [minDate]);

  const canGoPrev = useMemo(() => {
    const currentViewFirst = new Date(viewYear, viewMonth, 1);
    return currentViewFirst > minNavDate;
  }, [viewYear, viewMonth, minNavDate]);

  const canGoNext = useMemo(() => {
    const currentViewFirst = new Date(viewYear, viewMonth, 1);
    return currentViewFirst < maxNavDate;
  }, [viewYear, viewMonth, maxNavDate]);

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // In JS getDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat
    // Shift so Monday is 0 and Sunday is 6
    const leadingBlanks = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const days = [];

    // Leading empty cells
    for (let i = 0; i < leadingBlanks; i++) {
      days.push({ blank: true, key: `blank-${i}` });
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}`;
      const dayDate = new Date(`${iso}T00:00:00`);
      const dayOfWeek = dayDate.getDay(); // 0 is Sun

      const isSunday = dayOfWeek === 0;
      const isPast = todayIso ? iso < todayIso : false;
      const isToday = todayIso ? iso === todayIso : false;
      const isBeforeMin = minDate ? iso < minDate : false;

      // Check if doctor marked this whole date as leave/blackout
      const doctorBlocked = doctorBlockedDates.find((b) => b.date === iso);
      const isDoctorLeave = Boolean(doctorBlocked);

      // Unbookable if Sunday, doctor on leave, before minimum allowed date (e.g. today or past), or disabled
      const isUnselectable = isSunday || isDoctorLeave || isBeforeMin || disabled;
      const isSelected = iso === selectedDate;

      let reason = '';
      if (isSunday) {
        reason = 'Clinic closed on Sundays';
      } else if (isDoctorLeave) {
        reason = `Doctor on leave: ${doctorBlocked?.reason || 'Unavailable'}`;
      } else if (isToday) {
        reason = 'Advance booking required (Today is closed for online booking)';
      } else if (isPast) {
        reason = 'Past date';
      }

      days.push({
        blank: false,
        key: iso,
        day,
        iso,
        isSunday,
        isDoctorLeave,
        isToday,
        isPast,
        isBeforeMin,
        isUnselectable,
        isSelected,
        reason,
      });
    }

    return days;
  }, [viewYear, viewMonth, todayIso, minDate, selectedDate, disabled, doctorBlockedDates]);

  const selectedDisplayFormatted = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const d = new Date(`${selectedDate}T00:00:00`);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }, [selectedDate]);

  return (
    <div className="custom-calendar-widget">
      {/* Calendar Header */}
      <div className="cal-header">
        <div className="cal-title-wrap">
          <span className="cal-month-name">{MONTH_NAMES[viewMonth]}</span>
          <span className="cal-year-num">{viewYear}</span>
        </div>

        <div className="cal-nav-actions">
          <button
            type="button"
            className="cal-nav-btn"
            onClick={handlePrevMonth}
            disabled={!canGoPrev || disabled}
            aria-label="Previous month"
            title={canGoPrev ? 'View previous month' : 'Cannot view past months'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <button
            type="button"
            className="cal-nav-btn"
            onClick={handleNextMonth}
            disabled={!canGoNext || disabled}
            aria-label="Next month"
            title={canGoNext ? 'View next month' : 'Advance booking limited to next 3 months'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>

      {/* Weekday Column Headers */}
      <div className="cal-weekdays" role="row">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd.short}
            className={`cal-weekday ${wd.isSunday ? 'cal-weekday-sun' : ''}`}
            title={wd.isSunday ? 'Clinic closed on Sundays' : wd.full}
          >
            <span>{wd.short}</span>
            {wd.isSunday && <small className="cal-sun-tag">Closed</small>}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="cal-days-grid" role="grid" aria-label="Appointment date calendar">
        {calendarDays.map((item) => {
          if (item.blank) {
            return <div key={item.key} className="cal-day-cell cal-blank-cell" aria-hidden="true" />;
          }

          const {
            iso,
            day,
            isSunday,
            isDoctorLeave,
            isToday,
            isUnselectable,
            isSelected,
            reason,
          } = item;

          return (
            <button
              key={item.key}
              type="button"
              className={`cal-day-cell ${isSelected ? 'selected' : ''} ${
                isUnselectable ? 'disabled' : 'available'
              } ${isSunday ? 'sunday' : ''} ${isDoctorLeave ? 'doctor-leave' : ''} ${
                isToday ? 'today' : ''
              }`}
              disabled={isUnselectable || disabled}
              onClick={() => onSelectDate(iso!)}
              aria-label={`${day} ${MONTH_NAMES[viewMonth]} ${viewYear}${
                isSelected ? ', Selected' : ''
              }${reason ? ` (${reason})` : ' (Available)'}`}
              aria-selected={isSelected}
              title={reason || 'Click to select this date'}
            >
              <span className="cal-day-num">{day}</span>
              {isToday && <span className="cal-today-badge">Today</span>}
              {isSunday && <span className="cal-closed-pill">Closed</span>}
              {isDoctorLeave && <span className="cal-leave-pill" title={reason}>Leave</span>}
              {!isUnselectable && !isSelected && <span className="cal-avail-dot" />}
              {isSelected && <span className="cal-selected-check">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Calendar Legend */}
      <div className="cal-legend">
        <div className="cal-legend-item">
          <span className="cal-legend-dot dot-avail" />
          <span>Available</span>
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot dot-selected" />
          <span>Selected</span>
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot dot-closed" />
          <span>Sunday (Closed)</span>
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot dot-leave" />
          <span>Doctor On Leave</span>
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot dot-disabled" />
          <span>Past / Today</span>
        </div>
      </div>

      {/* Selected Date Notification Ribbon */}
      {selectedDisplayFormatted ? (
        <div className="cal-selected-banner">
          <div className="cal-banner-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <div className="cal-banner-text">
            <strong>Selected Consultation Date:</strong>
            <span>{selectedDisplayFormatted}</span>
          </div>
        </div>
      ) : (
        <div className="cal-empty-prompt">
          Please select an available date from tomorrow onwards.
        </div>
      )}
    </div>
  );
}

