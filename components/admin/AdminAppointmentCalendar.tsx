'use client';

import React, { useState, useMemo } from 'react';
import { Appointment } from '@/lib/storage';
import { DoctorOverride } from '@/lib/availability';
import { useClinicSettings } from '@/lib/useClinicSettings';
import { areAllSlotsOccupied } from '@/lib/slots';

interface AdminAppointmentCalendarProps {
  appointments: Appointment[];
  overrides?: DoctorOverride[];
  onSelectPatient: (appt: Appointment) => void;
  onBookDate: (dateIso: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

export default function AdminAppointmentCalendar({
  appointments,
  overrides = [],
  onSelectPatient,
  onBookDate,
}: AdminAppointmentCalendarProps) {
  const { step, isClosedOn, slotsForDate } = useClinicSettings();
  // Today in Asia/Kolkata
  const todayIso = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((appt) => {
      const list = map.get(appt.date) || [];
      list.push(appt);
      map.set(appt.date, list);
    });
    // Sort each day's appointments by time
    map.forEach((list) => {
      list.sort((a, b) => a.time.localeCompare(b.time));
    });
    return map;
  }, [appointments]);

  // Map overrides by date
  const overridesByDate = useMemo(() => {
    const map = new Map<string, DoctorOverride>();
    overrides.forEach((o) => {
      map.set(o.date, o);
    });
    return map;
  }, [overrides]);

  // Calendar grid calculation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    // Monday is index 0 in our WEEKDAYS (0 = Mon ... 6 = Sun)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: {
      dateIso: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isPast: boolean;
    }[] = [];

    // Previous month padding days
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthLastDay - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dNum);
      const iso = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(
        dNum
      ).padStart(2, '0')}`;
      days.push({
        dateIso: iso,
        dayNum: dNum,
        isCurrentMonth: false,
        isToday: iso === todayIso,
        isPast: iso < todayIso,
      });
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const iso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateIso: iso,
        dayNum: d,
        isCurrentMonth: true,
        isToday: iso === todayIso,
        isPast: iso < todayIso,
      });
    }

    // Trailing padding days to fill 35 or 42 grid slots
    const totalSlots = days.length <= 35 ? 35 : 42;
    let nextDayNum = 1;
    while (days.length < totalSlots) {
      const nextDate = new Date(currentYear, currentMonth + 1, nextDayNum);
      const iso = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(
        nextDayNum
      ).padStart(2, '0')}`;
      days.push({
        dateIso: iso,
        dayNum: nextDayNum,
        isCurrentMonth: false,
        isToday: iso === todayIso,
        isPast: iso < todayIso,
      });
      nextDayNum++;
    }

    return days;
  }, [currentYear, currentMonth, todayIso]);

  return (
    <div className="admin-calendar-view-card">
      {/* Calendar View Header Controls */}
      <div className="admin-cal-header">
        <div className="cal-nav-left">
          <h3 className="cal-month-title">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h3>
          <span className="cal-appt-count">
            {appointments.filter((a) => a.date.startsWith(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`)).length} appointments this month
          </span>
        </div>

        <div className="cal-nav-controls">
          <button type="button" className="btn-cal-today" onClick={handleToday}>
            Today
          </button>
          <div className="cal-arrows-group">
            <button
              type="button"
              className="btn-cal-arrow"
              onClick={handlePrevMonth}
              title="Previous Month"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              className="btn-cal-arrow"
              onClick={handleNextMonth}
              title="Next Month"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Names Header */}
      <div className="cal-weekdays-grid">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="cal-weekday-cell">
            {wd}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="cal-days-grid">
        {calendarDays.map((day) => {
          const dayAppts = appointmentsByDate.get(day.dateIso) || [];
          const override = overridesByDate.get(day.dateIso);
          const isFullDayLeave = override?.type === 'full_day';
          const isSunday = isClosedOn(day.dateIso); // weekly-off day per the day-wise schedule

          // Occupied slots calculation
          const activeAppts = dayAppts.filter((a) => a.status !== 'cancelled');
          const blockedSlots = override?.type === 'specific_slots' ? (override.blockedSlots || []) : [];
          const isFullyBooked = areAllSlotsOccupied(
            slotsForDate(day.dateIso).map((slot) => slot.value),
            activeAppts.map((a) => a.time),
            blockedSlots,
            step
          );

          const isPastOrToday = day.dateIso <= todayIso;
          const isBookingDisabled =
            !day.isCurrentMonth || isPastOrToday || isSunday || isFullDayLeave || isFullyBooked;
          const isBookable = !isBookingDisabled;
          const hasAppointments = dayAppts.length > 0;

          return (
            <div
              key={day.dateIso}
              className={`cal-day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${
                day.isToday ? 'cell-today' : ''
              } ${day.isPast ? 'cell-past' : ''} ${isSunday ? 'cell-sunday' : ''} ${
                isFullDayLeave ? 'cell-doctor-leave' : ''
              } ${isFullyBooked ? 'cell-fully-booked' : ''} ${
                isBookingDisabled ? 'cell-not-bookable' : 'cell-bookable'
              }`}
            >
              <div className="cal-cell-top">
                <span className={`cal-day-num ${day.isToday ? 'today-num-badge' : ''}`}>
                  {day.dayNum}
                </span>

                {/* When there are appointments on this bookable date: show add icon in TOP RIGHT CORNER */}
                {isBookable && hasAppointments && (
                  <button
                    type="button"
                    className="btn-quick-add-slot btn-add-top-right"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBookDate(day.dateIso);
                    }}
                    title={`Book appointment on ${day.dateIso}`}
                    aria-label={`Book appointment on ${day.dateIso}`}
                  >
                    +
                  </button>
                )}
              </div>

              {/* Sunday Clinic Weekly Off Marker */}
              {isSunday && day.isCurrentMonth && (
                <div className="cal-sunday-pill" title="Doctor does not sit on this day (Weekly Off)">
                  <span>Weekly Off</span>
                </div>
              )}

              {/* Doctor Leave Marker */}
              {isFullDayLeave && (
                <div className="cal-leave-pill" title={override.reason || 'Doctor on leave'}>
                  <span>⚠️ Leave: {override.reason || 'Unavailable'}</span>
                </div>
              )}

              {/* Fully Booked Marker */}
              {isFullyBooked && !isPastOrToday && !isSunday && !isFullDayLeave && (
                <div
                  className="cal-fullybooked-pill"
                  title="All appointment slots are booked for this date"
                >
                  <span>🔴 Fully Booked (10/10)</span>
                </div>
              )}

              {/* When NO appointments on this bookable date: place add icon in CENTER */}
              {isBookable && !hasAppointments && !isFullDayLeave && (
                <div
                  className="cal-cell-center-add"
                  onClick={() => onBookDate(day.dateIso)}
                  title={`Click to book appointment on ${day.dateIso}`}
                >
                  <button
                    type="button"
                    className="btn-center-add-slot"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBookDate(day.dateIso);
                    }}
                    title={`Book appointment on ${day.dateIso}`}
                    aria-label={`Book appointment on ${day.dateIso}`}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Day's Appointments List */}
              {hasAppointments && (
                <div className="cal-cell-appts-list">
                  {dayAppts.map((appt) => {
                    const isOffline = appt.consultationType === 'offline';
                    const isCancelled = appt.status === 'cancelled';
                    const isCash = appt.paymentMethod === 'Cash';

                    return (
                      <button
                        key={appt.id}
                        type="button"
                        onClick={() => onSelectPatient(appt)}
                        className={`cal-appt-chip ${
                          isCancelled
                            ? 'chip-cancelled'
                            : isOffline
                            ? 'chip-offline'
                            : 'chip-online'
                        }`}
                        title={`${appt.fullName} • ${appt.time} • ${
                          isOffline ? 'In-Clinic (Offline)' : 'Online (Google Meet)'
                        } • Payment: ${appt.paymentMethod} (₹${appt.amount || 800})`}
                      >
                        <span className="chip-time">{appt.time}</span>
                        <strong className="chip-name">{appt.fullName}</strong>
                        {isOffline && (
                          <span className="chip-offline-tag">
                            {isCash ? 'Offline • Cash' : 'Offline'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Calendar Legend Bar */}
      <div className="cal-footer-legend">
        <div className="legend-items-wrap">
          <span className="legend-chip-sample chip-offline">
            In-Clinic (Offline Consultation • Cash)
          </span>
          <span className="legend-chip-sample chip-online">
            Online Video (Google Meet)
          </span>
          <span className="legend-chip-sample chip-cancelled">
            Cancelled
          </span>
          <span className="legend-chip-sample cell-doctor-leave">
            Doctor Leave / Blackout
          </span>
          <span className="legend-chip-sample legend-sunday">
            Weekly Off (Closed)
          </span>
          <span className="legend-chip-sample legend-fullybooked">
            Fully Booked
          </span>
        </div>
        <p className="legend-tip">
          Click any appointment badge to view full clinical notes, or click <strong>+</strong> on any available upcoming date to schedule a visit.
        </p>
      </div>
    </div>
  );
}