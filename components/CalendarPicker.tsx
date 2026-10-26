'use client';

import React, { useState, useMemo, useEffect } from 'react';

interface CalendarPickerProps {
  selectedDate: string; // "YYYY-MM-DD"
  onSelectDate: (dateIso: string) => void;
  minDate: string; // "YYYY-MM-DD" (tomorrow)
  disabled?: boolean;
  doctorBlockedDates?: { date: string; reason: string }[];
  /** JS weekday numbers (0 = Sunday) on which the doctor does not sit. Defaults to Sunday. */
  closedWeekdays?: number[];
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
  closedWeekdays = [0],
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

      const isSunday = closedWeekdays.includes(dayOfWeek); // "closed day"
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
        reason = `Doctor does not sit on ${WEEKDAYS[dayOfWeek === 0 ? 6 : dayOfWeek - 1].full}s`;
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
  }, [viewYear, viewMonth, todayIso, minDate, selectedDate, disabled, doctorBlockedDates, closedWeekdays.join(',')]);

  return (
    <div className="bkc">
      <div className="bkc-head">
        <div className="bkc-title">
          <span className="bkc-month">{MONTH_NAMES[viewMonth]}</span>
          <span className="bkc-year">{viewYear}</span>
        </div>
        <div className="bkc-nav">
          <button
            type="button"
            className="bkc-nav-btn"
            onClick={handlePrevMonth}
            disabled={!canGoPrev || disabled}
            aria-label="Previous month"
            title={canGoPrev ? 'View previous month' : 'Cannot view past months'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button
            type="button"
            className="bkc-nav-btn"
            onClick={handleNextMonth}
            disabled={!canGoNext || disabled}
            aria-label="Next month"
            title={canGoNext ? 'View next month' : 'Advance booking limited to next 3 months'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <div className="bkc-weekdays" role="row">
        {WEEKDAYS.map((wd, wdIndex) => {
          const isClosedWeekday = closedWeekdays.includes((wdIndex + 1) % 7);
          return (
          <div
            key={wd.short}
            className={`bkc-weekday ${isClosedWeekday ? 'is-sun' : ''}`}
            title={isClosedWeekday ? `Doctor does not sit on ${wd.full}s` : wd.full}
          >
            {wd.short}
          </div>
          );
        })}
      </div>

      <div className="bkc-grid" role="grid" aria-label="Appointment date calendar">
        {calendarDays.map((item) => {
          if (item.blank) {
            return <div key={item.key} className="bkc-cell is-blank" aria-hidden="true" />;
          }

          const { iso, day, isSunday, isDoctorLeave, isToday, isUnselectable, isSelected, reason } = item;

          const cls = [
            'bkc-cell',
            isSelected ? 'is-selected' : isUnselectable ? 'is-disabled' : 'is-available',
            isSunday ? 'is-sunday' : '',
            isDoctorLeave ? 'is-leave' : '',
            isToday ? 'is-today' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={item.key}
              type="button"
              className={cls}
              disabled={isUnselectable || disabled}
              onClick={() => onSelectDate(iso!)}
              aria-label={`${day} ${MONTH_NAMES[viewMonth]} ${viewYear}${
                isSelected ? ', Selected' : ''
              }${reason ? ` (${reason})` : ' (Available)'}`}
              aria-selected={isSelected}
              title={reason || 'Click to select this date'}
            >
              <span className="bkc-num">{day}</span>
              {isDoctorLeave && <span className="bkc-tag">Leave</span>}
            </button>
          );
        })}
      </div>

      <div className="bkc-legend">
        <span><i className="bkc-dot d-avail" />Available</span>
        <span><i className="bkc-dot d-selected" />Selected</span>
        <span><i className="bkc-dot d-leave" />Doctor leave</span>
        <span><i className="bkc-dot d-off" />Sun / past</span>
      </div>
    </div>
  );
}