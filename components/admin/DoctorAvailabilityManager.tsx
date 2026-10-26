'use client';

import React, { useState } from 'react';
import { DoctorOverride } from '@/lib/availability';
import { Appointment } from '@/lib/storage';
import ThemedDatePicker from './ThemedDatePicker';
import { toast } from '@/components/ui/Toast';
import { useClinicSettings } from '@/lib/useClinicSettings';
import { expandBookedTimes } from '@/lib/slots';
import SlotSettingsCard from './SlotSettingsCard';

const PRESET_REASONS = [
  'Personal Leave',
  'Attending Medical Conference',
  'Clinical Case Review Meeting',
  'Emergency / Minor Procedure',
  'Clinic Maintenance / Holiday',
];

interface DoctorAvailabilityManagerProps {
  overrides: DoctorOverride[];
  appointments?: Appointment[];
  onRefresh: () => void | Promise<void>;
  onOverridesChange?: (nextOverrides: DoctorOverride[]) => void;
}

export default function DoctorAvailabilityManager({
  overrides,
  appointments = [],
  onRefresh,
  onOverridesChange,
}: DoctorAvailabilityManagerProps) {
  const { slots: UNION_SLOTS, slotsForDate, step } = useClinicSettings();
  const tomorrowIso = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }, []);

  const [date, setDate] = useState(tomorrowIso);
  // Blackout slots follow the weekday of the chosen date (day-wise timings + location)
  const ALL_SLOTS = slotsForDate(date);
  const slotValues = ALL_SLOTS.map((s) => s.value);
  const [type, setType] = useState<'full_day' | 'specific_slots'>('full_day');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // A booked appointment also blocks neighbouring slots inside its duration + buffer window
  const bookedSlots = new Set(
    expandBookedTimes(
      slotValues,
      appointments
        .filter((appointment) => appointment.date === date && appointment.status !== 'cancelled')
        .map((appointment) => appointment.time),
      step
    )
  );

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    setSelectedSlots([]);
  };

  const toggleSlot = (slotVal: string) => {
    setSelectedSlots((prev) =>
      prev.includes(slotVal) ? prev.filter((s) => s !== slotVal) : [...prev, slotVal]
    );
  };

  const handleSelectAllSlots = () => {
    setSelectedSlots(ALL_SLOTS.filter((s) => !bookedSlots.has(s.value)).map((s) => s.value));
  };

  const handleClearSlots = () => {
    setSelectedSlots([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!date) {
      setFeedback({ type: 'error', message: 'Please select a date for the availability override.' });
      toast.warning('Please select a date for the availability override.', 'Missing Date');
      return;
    }

    if (type === 'specific_slots' && selectedSlots.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Please choose at least one time slot to block.',
      });
      toast.warning('Please choose at least one time slot to block.', 'No Slots Selected');
      return;
    }

    setIsSubmitting(true);

    try {
      const accessToken = typeof window !== 'undefined' ? localStorage.getItem('admin_access_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch('/api/availability', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          date,
          type,
          blockedSlots: type === 'specific_slots' ? selectedSlots : undefined,
          reason: reason.trim() || (type === 'full_day' ? 'Doctor On Leave' : 'Doctor Unavailable'),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save availability');
      }

      if (Array.isArray(data.overrides) && onOverridesChange) {
        onOverridesChange(data.overrides);
      }

      setFeedback({
        type: 'success',
        message: `Availability override successfully applied for ${date}. This date/slots are now blocked in the booking calendar.`,
      });
      toast.success(
        `Doctor blackout successfully applied for ${date}. Slots are now blocked.`,
        'Blackout Applied'
      );

      setReason('');
      setSelectedSlots([]);
      await onRefresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error setting availability.';
      setFeedback({
        type: 'error',
        message: errMsg,
      });
      toast.error(errMsg, 'Failed to Apply Blackout');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, overrideDate: string) => {
    setFeedback(null);
    setRestoringId(id);

    try {
      const accessToken = typeof window !== 'undefined' ? localStorage.getItem('admin_access_token') : null;
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`/api/availability?id=${encodeURIComponent(id)}&t=${Date.now()}`, {
        method: 'DELETE',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore availability.');
      }

      if (Array.isArray(data.overrides) && onOverridesChange) {
        onOverridesChange(data.overrides);
      } else if (onOverridesChange) {
        onOverridesChange(overrides.filter((item) => item.id !== id));
      }

      setFeedback({
        type: 'success',
        message: `Availability restored for ${overrideDate}. Slots on this date are now open for booking.`,
      });
      toast.success(
        `Availability restored for ${overrideDate}. Slots are now open for booking.`,
        'Availability Restored'
      );

      await onRefresh();
    } catch (err: unknown) {
      console.error('Failed to delete availability override:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to restore availability.';
      setFeedback({
        type: 'error',
        message: errMsg,
      });
      toast.error(errMsg, 'Failed to Restore Availability');
    } finally {
      setRestoringId(null);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/availability?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (Array.isArray(data.overrides) && onOverridesChange) {
        onOverridesChange(data.overrides);
      }
      await onRefresh();
      setFeedback({
        type: 'success',
        message: 'Active doctor overrides list refreshed.',
      });
      toast.info('Active doctor overrides list refreshed.', 'Overrides Refreshed');
    } catch (err) {
      console.error('Error refreshing overrides:', err);
      setFeedback({
        type: 'error',
        message: 'Unable to refresh overrides. Please try again.',
      });
      toast.error('Unable to refresh overrides. Please try again.', 'Refresh Failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="admin-availability-section">
      {/* Informational Guidance Banner */}
      {/* <div className="admin-info-banner">
        <div className="banner-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div>
          <strong>Doctor Leave &amp; Blackout Management</strong>
          <p>
            Block entire days (e.g. Next Monday) or individual consultation slots. Overrides take effect immediately across the patient booking portal and prevent double-booking.
          </p>
        </div>
      </div> */}

      {feedback && (
        <div className={`admin-alert alert-${feedback.type}`} role="status">
          {feedback.message}
        </div>
      )}

      {/* Appointment duration + buffer + working hours */}
      <SlotSettingsCard onSaved={onRefresh} />

      <div className="availability-layout-grid">
        {/* Availability Form Card */}
        <div className="availability-card form-card">
          <h3 className="card-heading">Set Unavailability / Blackout</h3>
          <p className="card-subhead">Specify dates or hours when Dr. Mahesh Shete will not take appointments.</p>

          <form onSubmit={handleSubmit} className="availability-form">
            <div className="form-group datepicker-form-group">
              <ThemedDatePicker
                value={date}
                onChange={handleDateChange}
                minDate={tomorrowIso}
                label="Target Date"
                existingOverrides={overrides}
                disabled={isSubmitting}
                disableWeeklyOff={false}
                disableDoctorLeaves={false}
                disableFullyBooked={false}
              />
              <span className="field-hint">Select tomorrow or any upcoming date to block</span>
            </div>

            <div className="form-group">
              <label>Blackout Type</label>
              <div className="type-toggle-group">
                <button
                  type="button"
                  className={`toggle-option ${type === 'full_day' ? 'active' : ''}`}
                  onClick={() => setType('full_day')}
                >
                  <span className="option-title">Full Day Off / Leave</span>
                  <span className="option-desc">No consultations all day</span>
                </button>
                <button
                  type="button"
                  className={`toggle-option ${type === 'specific_slots' ? 'active' : ''}`}
                  onClick={() => setType('specific_slots')}
                >
                  <span className="option-title">Specific Time Slots</span>
                  <span className="option-desc">Block only chosen hours</span>
                </button>
              </div>
            </div>

            {/* If Specific Slots: Render Slot Selection Grid */}
            {type === 'specific_slots' && (
              <div className="form-group slot-picker-group">
                <div className="slot-picker-head">
                  <label>Select Slots to Block</label>
                  <div className="slot-quick-actions">
                    <button type="button" onClick={handleSelectAllSlots} className="quick-btn">
                      Select All
                    </button>
                    <button type="button" onClick={handleClearSlots} className="quick-btn">
                      Clear
                    </button>
                  </div>
                </div>

                {ALL_SLOTS.length === 0 && (
                  <span className="field-hint">The doctor does not sit on this weekday (see Weekly Schedule above).</span>
                )}
                <div className="slot-chips-grid">
                  {ALL_SLOTS.map((s) => {
                    const isSelected = selectedSlots.includes(s.value);
                    const isBooked = bookedSlots.has(s.value);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        className={`slot-chip ${isSelected ? 'chip-blocked' : ''} ${isBooked ? 'chip-booked' : ''}`}
                        disabled={isBooked}
                        onClick={() => toggleSlot(s.value)}
                        title={isBooked ? 'This time slot is already booked' : undefined}
                      >
                        <span>{s.label}</span>
                        {s.location && new Set(ALL_SLOTS.map((x) => x.location)).size > 1 ? (
                          <span className="chip-loc">{s.location}</span>
                        ) : null}
                        {isBooked ? (
                          <span className="chip-booked-mark">Booked</span>
                        ) : isSelected ? (
                          <span className="chip-mark">&times; Block</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <span className="field-hint">
                  {selectedSlots.length} slot{selectedSlots.length === 1 ? '' : 's'} selected to block
                </span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="override-reason">Reason / Note for Blackout</label>
              <input
                type="text"
                id="override-reason"
                placeholder="e.g. Attending Conference, Personal leave, Seminar"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="admin-input"
              />

              <div className="preset-tags-wrap">
                <span className="preset-label">Quick Presets:</span>
                {PRESET_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="preset-tag-btn"
                    onClick={() => setReason(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-save-override"
            >
              {isSubmitting ? 'Saving Override...' : 'Apply Doctor Blackout'}
            </button>
          </form>
        </div>

        {/* Existing Overrides List Card */}
        <div className="availability-card list-card">
          <div className="list-card-header">
            <div>
              <h3 className="card-heading">Active Doctor Overrides</h3>
              <p className="card-subhead">
                {overrides.length} leave / blackout rule{overrides.length === 1 ? '' : 's'} registered
              </p>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="btn-refresh"
              title="Refresh list"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          {overrides.length === 0 ? (
            <div className="empty-overrides-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{ marginInline: 'auto' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <p>No active doctor leaves or blackouts registered.</p>
              <small>All days in the weekly schedule are currently open for patient booking.</small>
            </div>
          ) : (
            <div className="overrides-table-wrapper">
              <table className="admin-table overrides-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Blocked Details</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((item) => {
                    const isRestoring = restoringId === item.id;
                    const parsedDate = new Date(`${item.date}T00:00:00`);
                    const formattedDate = !isNaN(parsedDate.getTime())
                      ? parsedDate.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : item.date;
                    const weekdayLabel = !isNaN(parsedDate.getTime())
                      ? parsedDate.toLocaleDateString('en-IN', { weekday: 'long' })
                      : '';

                    return (
                      <tr key={item.id}>
                        <td className="col-override-date">
                          <div className="override-date-cell">
                            <strong>{formattedDate}</strong>
                            <span>{weekdayLabel || item.date}</span>
                          </div>
                        </td>
                        <td className="col-override-type">
                          <span className={`override-type-pill ${item.type}`}>
                            {item.type === 'full_day' ? 'Full Day Off' : 'Partial Slots'}
                          </span>
                        </td>
                        <td className="col-override-details">
                          {item.type === 'full_day' ? (
                            <span className="full-day-blocked-text">All clinic slots blocked</span>
                          ) : (
                            <div className="blocked-slots-badges">
                              {item.blockedSlots?.map((slotVal) => {
                                const label = UNION_SLOTS.find((s) => s.value === slotVal)?.label || slotVal;
                                return (
                                  <span key={slotVal} className="slot-badge-mini">
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="col-override-reason">
                          <span className="override-reason-text">{item.reason || 'Doctor unavailable'}</span>
                        </td>
                        <td className="col-override-action">
                          <button
                            type="button"
                            className="btn-delete-override"
                            disabled={isRestoring}
                            onClick={() => handleDelete(item.id, item.date)}
                            title="Restore availability on this date"
                          >
                            {isRestoring ? 'Restoring...' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}