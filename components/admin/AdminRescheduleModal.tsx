'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Appointment } from '@/lib/storage';
import { DoctorOverride } from '@/lib/availability';
import ThemedDatePicker from './ThemedDatePicker';
import { toast } from '@/components/ui/Toast';
import { useClinicSettings } from '@/lib/useClinicSettings';

const RESCHEDULE_REASONS = [
  'Patient requested date/time change',
  'Doctor schedule shift / hospital round',
  'Patient travel / transportation delay',
  'Medical emergency / symptom flare-up',
  'Routine follow-up interval adjustment',
  'Other administrative adjustment',
];

interface AdminRescheduleModalProps {
  appointment: Appointment | null;
  onClose: () => void;
  onSuccess: () => void;
  appointments?: Appointment[];
  overrides?: DoctorOverride[];
}

export default function AdminRescheduleModal({
  appointment,
  onClose,
  onSuccess,
  appointments = [],
  overrides = [],
}: AdminRescheduleModalProps) {
  const { slotsForDate, locationFor } = useClinicSettings();
  // Today in Asia/Kolkata
  const todayIso = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  // Only the chosen weekday's slots (day-wise timings), each with its location
  const daySlots = slotsForDate(newDate);
  const newLocation = newTime ? locationFor(newDate, newTime) : undefined;
  const [consultationType, setConsultationType] = useState<'offline' | 'online'>('offline');
  const [reasonChoice, setReasonChoice] = useState(RESCHEDULE_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successResult, setSuccessResult] = useState<{
    date: string;
    time: string;
    consultationType: 'offline' | 'online';
    calendarRescheduled?: boolean;
  } | null>(null);

  // Initialize from appointment
  useEffect(() => {
    if (appointment) {
      setNewDate(appointment.date);
      setNewTime(appointment.time);
      setConsultationType(appointment.consultationType || 'offline');
      setReasonChoice(RESCHEDULE_REASONS[0]);
      setCustomReason('');
      setErrorMsg('');
      setSuccessResult(null);
    }
  }, [appointment]);

  // If the new date is a different weekday, drop a time that is not in that day's timings
  useEffect(() => {
    if (!newDate) return;
    setNewTime((curr) => (curr && !slotsForDate(newDate).some((x) => x.value === curr) ? '' : curr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate]);

  // Handle ESC key and body scroll lock
  useEffect(() => {
    if (!appointment) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [appointment]);

  // Load booked slots for chosen date
  useEffect(() => {
    if (!appointment || !newDate) return;
    let isCancelled = false;

    async function fetchSlots() {
      setIsLoadingSlots(true);
      try {
        const res = await fetch(`/api/appointments?date=${newDate}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setBookedSlots(data.bookedSlots || []);
          }
        }
      } catch (err) {
        console.error('Failed to fetch slot availability:', err);
      } finally {
        if (!isCancelled) setIsLoadingSlots(false);
      }
    }

    fetchSlots();
    return () => {
      isCancelled = true;
    };
  }, [newDate, appointment]);

  if (!appointment) return null;

  const handleClose = () => {
    setSuccessResult(null);
    setErrorMsg('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!newDate || !newTime) {
      const msg = 'Please select both a new date and time slot.';
      setErrorMsg(msg);
      toast.warning(msg, 'Slot Required');
      return;
    }

    if (
      newDate === appointment.date &&
      newTime === appointment.time &&
      consultationType === (appointment.consultationType || 'online')
    ) {
      const msg = 'Please select a different date, time, or consultation mode to reschedule.';
      setErrorMsg(msg);
      toast.warning(msg, 'No Changes Made');
      return;
    }

    setIsSubmitting(true);
    try {
      const fullReason = customReason.trim()
        ? `${reasonChoice}: ${customReason.trim()}`
        : reasonChoice;

      const token = localStorage.getItem('admin_access_token');
      const res = await fetch('/api/admin/appointments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          id: appointment.id,
          date: newDate,
          time: newTime,
          consultationType,
          isReschedule: true,
          rescheduleReason: fullReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reschedule appointment.');
      }

      toast.success(
        `Appointment successfully rescheduled to ${newDate} at ${newTime}.`,
        'Rescheduled Successfully'
      );

      setSuccessResult({
        date: newDate,
        time: newTime,
        consultationType,
        calendarRescheduled: data.calendarRescheduled,
      });

      onSuccess();
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'Failed to reschedule appointment.';
      setErrorMsg(errText);
      toast.error(errText, 'Reschedule Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-drawer-overlay" onClick={handleClose}>
      <aside
        className="admin-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-title"
      >
        {/* Header */}
        <header className="drawer-header">
          <div className="drawer-title-wrap">
            <span className="drawer-icon-badge" style={{ background: '#FFF7ED', color: '#EA580C' }} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <div>
              <h3 id="reschedule-title">Reschedule Appointment</h3>
              <p className="drawer-subtitle">
                Change consultation date, slot, or mode for <strong>{appointment.fullName}</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-drawer-close"
            onClick={handleClose}
            title="Close Panel"
            aria-label="Close reschedule panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Success Confirmation State */}
        {successResult ? (
          <div className="drawer-scroll-body drawer-success-state">
            <div className="success-icon-badge" style={{ background: '#FFF7ED', color: '#EA580C' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h4>Appointment Rescheduled!</h4>
            <p className="success-patient-desc">
              Successfully moved for <strong>{appointment.fullName}</strong>.
            </p>

            <div className="success-details-card">
              <div className="detail-row">
                <span>Previous Slot:</span>
                <span className="text-muted" style={{ textDecoration: 'line-through' }}>
                  {appointment.date} at {appointment.time}
                </span>
              </div>
              <div className="detail-row">
                <span>New Appointment:</span>
                <strong style={{ color: '#EA580C', fontSize: '14.5px' }}>
                  {successResult.date} at {successResult.time}
                </strong>
              </div>
              <div className="detail-row">
                <span>Consultation Mode:</span>
                <strong>
                  {successResult.consultationType === 'offline' ? 'In-Clinic (Offline)' : 'Online (Google Meet)'}
                </strong>
              </div>
              {successResult.calendarRescheduled && (
                <div className="detail-row">
                  <span>Google Calendar:</span>
                  <span className="text-green">Updated &amp; email invite dispatched to patient &bull; doctor</span>
                </div>
              )}
            </div>

            <div className="drawer-success-actions">
              {/* <a
                href={`/api/appointments/${appointment.id}/ics`}
                download
                className="btn-download-ics"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download Updated .ICS Calendar File</span>
              </a> */}

              <button type="button" className="btn-modal-done" onClick={handleClose}>
                Done / Return to Dashboard
              </button>
            </div>
          </div>
        ) : (
          /* Reschedule Form */
          <form onSubmit={handleSubmit} className="drawer-form-layout" id="admin-reschedule-form">
            <div className="drawer-scroll-body">
              {errorMsg && (
                <div className="modal-alert-error" role="alert">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Current Appointment Summary Card */}
              <div className="reschedule-current-card">
                <div className="rcc-header">
                  <span className="rcc-tag">Current Scheduled Slot</span>
                  <span className="rcc-id">#{appointment.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="rcc-body">
                  <div className="rcc-row">
                    <strong>{appointment.fullName}</strong>
                    <span>{appointment.phone}</span>
                  </div>
                  <div className="rcc-row-highlight">
                    <span className="rcc-date">{appointment.date}</span>
                    <span className="rcc-time">{appointment.time}</span>
                    <span className="rcc-mode">
                      {appointment.consultationType === 'offline' ? 'In-Clinic' : 'Online Meet'}
                    </span>
                  </div>
                  <div className="rcc-reason">
                    <em>Concern:</em> {appointment.reason}
                  </div>
                </div>
              </div>

              {/* 1. Mode Selector */}
              <div className="form-group-full">
                <label className="form-label-bold">Target Consultation Mode:</label>
                <div className="mode-toggle-grid">
                  <button
                    type="button"
                    className={`mode-card-btn ${consultationType === 'offline' ? 'active-offline' : ''}`}
                    onClick={() => setConsultationType('offline')}
                  >
                    <div className="mode-icon-box mode-icon-clinic">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18" />
                        <path d="M5 21V7l8-4v18" />
                        <path d="M19 21V11l-6-4" />
                        <path d="M9 9h1" />
                        <path d="M9 13h1" />
                        <path d="M9 17h1" />
                      </svg>
                    </div>
                    <div className="mode-text">
                      <div className="mode-title-row">
                        <strong>In-Clinic / Offline</strong>
                        {consultationType === 'offline' && <span className="mode-check-badge">✓ Selected</span>}
                      </div>
                      <span>Clinic In-Person Visit (Akurdi)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`mode-card-btn ${consultationType === 'online' ? 'active-online' : ''}`}
                    onClick={() => setConsultationType('online')}
                  >
                    <div className="mode-icon-box mode-icon-video">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                    </div>
                    <div className="mode-text">
                      <div className="mode-title-row">
                        <strong>Online Video (Meet)</strong>
                        {consultationType === 'online' && <span className="mode-check-badge">✓ Selected</span>}
                      </div>
                      <span>Google Meet Video Consultation</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. New Date Picker */}
              <div className="form-field">
                <label>
                  Select New Date <span className="req">*</span>
                </label>
                <ThemedDatePicker
                  value={newDate}
                  onChange={(d) => setNewDate(d)}
                  minDate={todayIso}
                  appointments={appointments}
                  existingOverrides={overrides}
                  disableWeeklyOff={true}
                  disableDoctorLeaves={true}
                  disableFullyBooked={true}
                  className="modal-date-picker"
                />
              </div>

              {/* 3. New Time Slot Selection */}
              <div className="form-field">
                <label>
                  Select New Time Slot <span className="req">*</span>
                  {isLoadingSlots && <small className="label-loading"> (Checking slots...)</small>}
                </label>
                <div className="slots-select-grid">
                  {newDate && daySlots.length === 0 && (
                    <p className="field-hint">The doctor does not sit on this day. Please pick another date.</p>
                  )}
                  {daySlots.map((slot) => {
                    // It's booked if it's in bookedSlots and NOT the appointment's own current slot on the current date
                    const isOwnCurrentSlot =
                      newDate === appointment.date && slot.value === appointment.time;
                    const isBooked = !isOwnCurrentSlot && bookedSlots.includes(slot.value);
                    const isSelected = newTime === slot.value;

                    return (
                      <button
                        key={slot.value}
                        type="button"
                        disabled={isBooked}
                        className={`slot-pill-btn ${isSelected ? 'selected' : ''} ${isBooked ? 'booked' : ''} ${
                          isOwnCurrentSlot ? 'current-slot-pill' : ''
                        }`}
                        onClick={() => setNewTime(slot.value)}
                      >
                        {slot.label}
                        {slot.location && new Set(daySlots.map((x) => x.location)).size > 1 && (
                          <span className="slot-pill-loc">{slot.location}</span>
                        )}
                        {isOwnCurrentSlot && <span className="current-slot-tag">Current</span>}
                        {isBooked && <span className="booked-badge">Booked</span>}
                      </button>
                    );
                  })}
                </div>
                {newLocation && (
                  <p className="field-hint" style={{ marginTop: 8 }}>
                    Doctor location for this slot: <strong>{newLocation}</strong>
                  </p>
                )}
              </div>

              {/* 4. Reason for Reschedule */}
              <div className="form-field">
                <label>Reason for Rescheduling</label>
                <select
                  value={reasonChoice}
                  onChange={(e) => setReasonChoice(e.target.value)}
                  className="modal-input modal-select"
                >
                  {RESCHEDULE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Additional Notes / Patient Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Patient requested morning shift due to medical checkup"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="modal-input"
                />
              </div>
            </div>

            {/* Sticky Bottom Actions Bar */}
            <footer className="drawer-footer-actions">
              <button
                type="button"
                className="btn-cancel-drawer"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="btn-submit-booking"
                style={{ background: '#EA580C' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span>Rescheduling &amp; Updating Invites...</span>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Confirm Reschedule to {newDate} ({newTime})</span>
                  </>
                )}
              </button>
            </footer>
          </form>
        )}
      </aside>
    </div>
  );
}