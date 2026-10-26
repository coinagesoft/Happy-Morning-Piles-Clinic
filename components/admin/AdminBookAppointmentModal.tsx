'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ThemedDatePicker from './ThemedDatePicker';
import { Appointment } from '@/lib/storage';
import { DoctorOverride } from '@/lib/availability';
import { toast } from '@/components/ui/Toast';
import { useClinicSettings } from '@/lib/useClinicSettings';
import {
  areAllSlotsOccupied,
  DEFAULT_CLINIC_SETTINGS,
  generateSlots,
  getSlotLocation,
  isClinicClosedOn,
  getWeekday,
  WEEKDAY_NAMES,
  ClinicSettings,
  getSlotStep,
} from '@/lib/slots';
import { CLINIC } from '@/lib/clinicInfo';

const DEFAULT_SLOT_VALUES = generateSlots(DEFAULT_CLINIC_SETTINGS).map((s) => s.value);
const DEFAULT_STEP = getSlotStep(DEFAULT_CLINIC_SETTINGS);

const HEALTH_REASONS = [
  'Piles (Bavasir / Mulvyadh)',
  'Fissure',
  'Fistula (Bhagandar)',
  'Pilonidal Sinus',
  'Stomach-Related Ailments',
  'Follow-up Consultation',
  'Other / General Consultation',
];

export function isClinicDateUnavailable(
  dateIso: string,
  overrides: DoctorOverride[] = [],
  appointments: Appointment[] = [],
  slotValues: string[] = DEFAULT_SLOT_VALUES,
  step: number = DEFAULT_STEP,
  settings?: ClinicSettings
): { unavailable: boolean; reason?: string } {
  if (!dateIso) return { unavailable: true, reason: 'Please select an appointment date.' };
  const d = new Date(`${dateIso}T00:00:00`);
  if (isNaN(d.getTime())) return { unavailable: true, reason: 'Invalid date format.' };

  // 1. Weekly off - day-wise schedule decides which weekdays the doctor sits (Sunday by default)
  const closed = settings ? isClinicClosedOn(settings, dateIso) : d.getDay() === 0;
  if (closed) {
    const dayName = settings ? WEEKDAY_NAMES[getWeekday(dateIso)] : 'Sunday';
    return { unavailable: true, reason: `The doctor does not take appointments on ${dayName}s (Weekly Off).` };
  }
  // Only this weekday's slots count when checking "fully booked"
  if (settings) slotValues = generateSlots(settings, dateIso).map((s) => s.value);

  // 2. Doctor on leave
  const override = overrides.find((o) => o.date === dateIso);
  if (override?.type === 'full_day') {
    return { unavailable: true, reason: `Doctor is on leave: ${override.reason || 'Unavailable'}.` };
  }

  // 3. Fully booked
  const activeAppts = appointments.filter((a) => a.date === dateIso && a.status !== 'cancelled');
  const blockedSlots = override?.type === 'specific_slots' ? (override.blockedSlots || []) : [];
  if (
    areAllSlotsOccupied(
      slotValues,
      activeAppts.map((a) => a.time),
      blockedSlots,
      step
    )
  ) {
    return { unavailable: true, reason: 'All appointment slots are fully booked for this date.' };
  }

  return { unavailable: false };
}

export function findNextAvailableClinicDate(
  startDateIso: string,
  overrides: DoctorOverride[] = [],
  appointments: Appointment[] = [],
  slotValues: string[] = DEFAULT_SLOT_VALUES,
  step: number = DEFAULT_STEP,
  settings?: ClinicSettings
): string {
  let curr = new Date(`${startDateIso}T00:00:00`);
  if (isNaN(curr.getTime())) {
    curr = new Date();
    curr.setDate(curr.getDate() + 1);
  }

  for (let i = 0; i < 60; i++) {
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(curr);
    const check = isClinicDateUnavailable(iso, overrides, appointments, slotValues, step, settings);
    if (!check.unavailable) {
      return iso;
    }
    curr.setDate(curr.getDate() + 1);
  }

  return startDateIso;
}

interface AdminBookAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string;
  appointments?: Appointment[];
  overrides?: DoctorOverride[];
}

export default function AdminBookAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  initialDate,
  appointments = [],
  overrides = [],
}: AdminBookAppointmentModalProps) {
  const { settings, slotValues, step, slotsForDate } = useClinicSettings();
  // Slots of the selected weekday only (each with its location)
  // Format today's date in YYYY-MM-DD
  const todayIso = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  const tomorrowIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  }, []);

  const [consultationType, setConsultationType] = useState<'offline' | 'online'>('offline');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [reason, setReason] = useState(HEALTH_REASONS[0]);
  const [date, setDate] = useState(() => {
    if (
      initialDate &&
      initialDate > todayIso &&
      !isClinicDateUnavailable(initialDate, overrides, appointments, slotValues, step, settings).unavailable
    ) {
      return initialDate;
    }
    return findNextAvailableClinicDate(tomorrowIso, overrides, appointments, slotValues, step, settings);
  });
  const [time, setTime] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Pending'>('Cash');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [amount, setAmount] = useState('800');
  const [notes, setNotes] = useState('');

  // Slot availability
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successResult, setSuccessResult] = useState<{
    id: string;
    calendarScheduled?: boolean;
    calendarMessage?: string;
    meetLink?: string;
  } | null>(null);

  // Sync initial date or fallback to first valid date
  useEffect(() => {
    if (
      initialDate &&
      initialDate > todayIso &&
      !isClinicDateUnavailable(initialDate, overrides, appointments, slotValues, step, settings).unavailable
    ) {
      setDate(initialDate);
    } else if (isOpen) {
      setDate((curr) => {
        if (
          curr &&
          curr > todayIso &&
          !isClinicDateUnavailable(curr, overrides, appointments, slotValues, step, settings).unavailable
        ) {
          return curr;
        }
        return findNextAvailableClinicDate(tomorrowIso, overrides, appointments, slotValues, step, settings);
      });
    }
  }, [initialDate, todayIso, tomorrowIso, overrides, appointments, isOpen, slotValues, step, settings]);

  // Slots + location of the selected weekday; keep the chosen time valid for that day
  const daySlots = slotsForDate(date);
  const selectedLocation = time ? getSlotLocation(settings, date, time) : undefined;
  useEffect(() => {
    if (!date) return;
    const list = slotsForDate(date);
    setTime((curr) => (list.some((s) => s.value === curr) ? curr : list[0]?.value ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, settings]);

  // ESC key listener & body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleResetAndClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Load booked slots for chosen date
  useEffect(() => {
    if (!isOpen || !date) return;
    let isCancelled = false;

    async function fetchSlots() {
      setIsLoadingSlots(true);
      try {
        const res = await fetch(`/api/appointments?date=${date}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setBookedSlots(data.bookedSlots || []);
            // If current time is booked, auto-select first free slot
            if (data.bookedSlots && data.bookedSlots.includes(time)) {
              const free = daySlots.find((s) => !data.bookedSlots.includes(s.value));
              if (free) setTime(free.value);
            }
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
  }, [date, isOpen, time]);

  // When switching consultation type, adjust default payment
  const handleTypeChange = (type: 'offline' | 'online') => {
    setConsultationType(type);
    if (type === 'offline') {
      setPaymentMethod('Cash');
      setPaymentStatus('paid');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // 1. Patient Name Validation
    if (!fullName.trim() || fullName.trim().length < 2) {
      const msg = 'Please enter a valid patient full name (minimum 2 characters).';
      setErrorMsg(msg);
      toast.warning(msg, 'Name Required');
      return;
    }

    // 2. Mobile Number Validation (Indian / 10-digit mobile)
    const rawPhone = phone.trim();
    if (!/^[6-9]\d{9}$/.test(rawPhone)) {
      const msg = 'Please provide a valid 10-digit mobile number starting with 6, 7, 8, or 9.';
      setErrorMsg(msg);
      toast.warning(msg, 'Invalid Mobile');
      return;
    }
    const cleanPhone = rawPhone;

    // 3. Email Validation
    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!trimmedEmail) {
      const msg = 'Patient email address is required.';
      setErrorMsg(msg);
      toast.warning(msg, 'Email Required');
      return;
    }
    if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
      const msg = 'Please enter a valid email address (e.g. name@example.com).';
      setErrorMsg(msg);
      toast.warning(msg, 'Invalid Email');
      return;
    }

    // 4. Age Validation
    let validatedAge = 0;
    if (!age.trim()) {
      const msg = 'Please enter the patient age.';
      setErrorMsg(msg);
      toast.warning(msg, 'Age Required');
      return;
    }
    {
      const parsedAge = Number(age.trim());
      if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        const msg = 'Please enter a valid age between 1 and 120 years.';
        setErrorMsg(msg);
        toast.warning(msg, 'Invalid Age');
        return;
      }
      validatedAge = parsedAge;
    }

    if (!reason.trim()) {
      const msg = 'Please select a consultation health concern.';
      setErrorMsg(msg);
      toast.warning(msg, 'Reason Required');
      return;
    }
    const fee = Number(amount);
    if (!amount.trim() || !Number.isFinite(fee) || fee <= 0) {
      const msg = 'Please enter a valid consultation fee.';
      setErrorMsg(msg);
      toast.warning(msg, 'Fee Required');
      return;
    }

    // 5. Date & Time Validation
    if (!date || !time) {
      const msg = 'Please select both an appointment date and time slot.';
      setErrorMsg(msg);
      toast.warning(msg, 'Slot Required');
      return;
    }
    if (date <= todayIso) {
      const msg = 'Appointments can only be scheduled for future dates (from tomorrow onwards).';
      setErrorMsg(msg);
      toast.warning(msg, 'Invalid Date');
      return;
    }
    const unavailableCheck = isClinicDateUnavailable(date, overrides, appointments, slotValues, step, settings);
    if (unavailableCheck.unavailable) {
      const msg = unavailableCheck.reason || 'The selected date is unavailable for booking.';
      setErrorMsg(msg);
      toast.warning(msg, 'Date Unavailable');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: cleanPhone,
          email: trimmedEmail,
          age: validatedAge,
          reason,
          date,
          time,
          consultationType,
          paymentMethod,
          paymentStatus,
          amount: Number(amount) || 800,
          notes: notes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule appointment.');
      }

      toast.success(
        `Appointment scheduled successfully for ${fullName.trim()} on ${date} at ${time}.`,
        'Appointment Created'
      );

      setSuccessResult({
        id: data.appointment?.id || '',
        calendarScheduled: data.calendarScheduled,
        calendarMessage: data.calendarMessage,
        meetLink: data.appointment?.meetLink,
      });

      onSuccess();
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'Failed to schedule appointment.';
      setErrorMsg(errText);
      toast.error(errText, 'Booking Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSuccessResult(null);
    setErrorMsg('');
    setFullName('');
    setPhone('');
    setEmail('');
    setAge('');
    setNotes('');
    onClose();
  };

  const handleBookAnother = () => {
    setSuccessResult(null);
    setErrorMsg('');
    setFullName('');
    setPhone('');
    setEmail('');
    setAge('');
    setNotes('');
  };

  if (!isOpen) return null;

  return (
    <div className="admin-drawer-overlay" onClick={handleResetAndClose}>
      <aside
        className="admin-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Drawer Header */}
        <header className="drawer-header">
          <div className="drawer-title-wrap">
            <span className="drawer-icon-badge" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="12" y1="14" x2="12" y2="18" />
                <line x1="10" y1="16" x2="14" y2="16" />
              </svg>
            </span>
            <div>
              <h3 id="drawer-title">Schedule New Appointment</h3>
              <p className="drawer-subtitle">
                Book offline walk-in visits or online consultations with cash or digital payment.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-drawer-close"
            onClick={handleResetAndClose}
            title="Close Panel"
            aria-label="Close booking panel"
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
            <div className="success-icon-badge">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h4>Appointment Confirmed!</h4>
            <p className="success-patient-desc">
              Scheduled for <strong>{fullName}</strong> on <strong>{date} at {time}</strong>.
            </p>

            <div className="success-details-card">
              <div className="detail-row">
                <span>Consultation Mode:</span>
                <strong>
                  {consultationType === 'offline' ? 'In-Clinic (Offline Consultation)' : 'Online Video (Google Meet)'}
                </strong>
              </div>
              <div className="detail-row">
                <span>Payment Settlement:</span>
                <strong className="text-green">
                  {paymentMethod} • ₹{amount} ({paymentStatus.toUpperCase()})
                </strong>
              </div>
              {successResult.calendarMessage && (
                <div className="detail-row">
                  <span>Calendar Invite:</span>
                  <span className="text-muted">{successResult.calendarMessage}</span>
                </div>
              )}
              {consultationType === 'offline' ? (
                <div className="detail-row">
                  <span>Clinic Address:</span>
                  <span className="text-muted">{CLINIC.address.full}</span>
                </div>
              ) : successResult.meetLink ? (
                <div className="detail-row">
                  <span>Google Meet:</span>
                  <a href={successResult.meetLink} target="_blank" rel="noopener noreferrer" className="text-blue">
                    Open Meet Call ↗
                  </a>
                </div>
              ) : null}
            </div>

            <div className="drawer-success-actions">
              {/* <a
                href={`/api/appointments/${successResult.id}/ics`}
                download
                className="btn-download-ics"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download .ICS Calendar File</span>
              </a> */}

              <div className="drawer-success-btns-row">
                <button type="button" className="btn-book-another" onClick={handleBookAnother}>
                  Book Another
                </button>
                <button type="button" className="btn-modal-done" onClick={handleResetAndClose}>
                  Done / Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Booking Form */
          <form onSubmit={handleSubmit} className="drawer-form-layout" id="admin-booking-form">
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

              {/* 1. Mode Selector Tabs */}
              <div className="form-group-full">
                <label className="form-label-bold">Select Consultation Mode:</label>
                <div className="mode-toggle-grid">
                  <button
                    type="button"
                    className={`mode-card-btn ${consultationType === 'offline' ? 'active-offline' : ''}`}
                    onClick={() => handleTypeChange('offline')}
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
                        <strong>In-Clinic / Offline (Walk-in)</strong>
                        {consultationType === 'offline' && <span className="mode-check-badge">✓ Active</span>}
                      </div>
                      <span>In-person visit at the Akurdi Clinic &bull; Cash Accepted</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`mode-card-btn ${consultationType === 'online' ? 'active-online' : ''}`}
                    onClick={() => handleTypeChange('online')}
                  >
                    <div className="mode-icon-box mode-icon-video">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                    </div>
                    <div className="mode-text">
                      <div className="mode-title-row">
                        <strong>Online Video (Google Meet)</strong>
                        {consultationType === 'online' && <span className="mode-check-badge">✓ Active</span>}
                      </div>
                      <span>Video link generated &amp; emailed to patient</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Patient Identity Fields */}
              <div className="form-row-2">
                <div className="form-field">
                  <label>
                    Patient Full Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Phone Number <span className="req">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={phone}
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                      if (errorMsg) setErrorMsg('');
                    }}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label>
                    Patient Email Address
                    <span className="req">*</span>
                    <small className="label-tip"> (for Google Calendar &amp; Meet Invite)</small>
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    placeholder="patient@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    className="modal-input"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Age <span className="req">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    placeholder="e.g. 30"
                    value={age}
                    onChange={(e) => {
                      setAge(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* 3. Reason for Visit */}
              <div className="form-field">
                <label>Consultation Health Concern <span className="req">*</span></label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="modal-input modal-select"
                  required
                >
                  {HEALTH_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Date & Time Selection */}
              <div className="form-field">
                <label>
                  Appointment Date <span className="req">*</span>
                </label>
                <ThemedDatePicker
                  value={date}
                  onChange={(newDate) => setDate(newDate)}
                  minDate={tomorrowIso}
                  appointments={appointments}
                  existingOverrides={overrides}
                  disableWeeklyOff={true}
                  disableDoctorLeaves={true}
                  disableFullyBooked={true}
                  className="modal-date-picker"
                />
              </div>

              <div className="form-field">
                <label>
                  Select Time Slot <span className="req">*</span>
                  {isLoadingSlots && <small className="label-loading"> (Checking slots...)</small>}
                </label>
                <div className="slots-select-grid">
                  {daySlots.length === 0 && (
                    <p className="field-hint">The doctor does not sit on this day. Please pick another date.</p>
                  )}
                  {daySlots.map((slot) => {
                    const isBooked = bookedSlots.includes(slot.value);
                    const isSelected = time === slot.value;
                    return (
                      <button
                        key={slot.value}
                        type="button"
                        disabled={isBooked}
                        className={`slot-pill-btn ${isSelected ? 'selected' : ''} ${isBooked ? 'booked' : ''}`}
                        onClick={() => setTime(slot.value)}
                      >
                        {slot.label}
                        {slot.location && new Set(daySlots.map((x) => x.location)).size > 1 && (
                          <span className="slot-pill-loc">{slot.location}</span>
                        )}
                        {isBooked && <span className="booked-badge">Booked</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedLocation && (
                  <p className="field-hint" style={{ marginTop: 8 }}>
                    Doctor location for this slot: <strong>{selectedLocation}</strong>
                  </p>
                )}
              </div>

              {/* 5. Payment & Billing Section */}
              <div className="modal-payment-section">
                <h4 className="payment-section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span>Payment &amp; Billing (Desk Settlement)</span>
                </h4>

                <div className="form-row-3">
                  <div className="form-field">
                    <label>Consultation Fee (₹) <span className="req">*</span></label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="modal-input font-bold"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => {
                        const m = e.target.value as 'Cash' | 'UPI' | 'Card' | 'Pending';
                        setPaymentMethod(m);
                        if (m === 'Cash') setPaymentStatus('paid');
                      }}
                      className="modal-input modal-select highlight-cash"
                    >
                      <option value="Cash">Cash (Desk Collection)</option>
                      <option value="UPI">UPI (QR / PhonePe / GPay)</option>
                      <option value="Card">Card / Swipe POS</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Payment Status</label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'pending')}
                      className={`modal-input modal-select ${paymentStatus === 'paid' ? 'status-paid-select' : 'status-pending-select'}`}
                    >
                      <option value="paid">Paid &amp; Settled</option>
                      <option value="pending">Awaiting Payment</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 6. Front Desk Notes */}
              <div className="form-field">
                <label>Front Desk Notes / Clinical Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Walk-in patient paid cash ₹800 at clinic reception"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="modal-input"
                />
              </div>
            </div>

            {/* Sticky Bottom Actions Bar */}
            <footer className="drawer-footer-actions">
              <button
                type="button"
                className="btn-cancel-drawer"
                onClick={handleResetAndClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="btn-submit-booking"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span>Scheduling &amp; Dispatching Invite...</span>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>
                      Schedule &amp; Confirm ({paymentMethod} ₹{amount})
                    </span>
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