'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Appointment } from '@/lib/storage';
import { toast } from '@/components/ui/Toast';
import {
  IconPhone,
  IconMail,
  IconCopy,
  IconCheck,
  IconVideo,
  IconBuilding,
  IconStethoscope,
  IconRefresh,
  IconPlus,
  IconClock,
  IconUsers,
} from './AdminIcons';

interface PatientHistoryModalProps {
  patient: {
    fullName: string;
    phone: string;
    email: string;
    age: number;
    appointments: Appointment[];
  } | null;
  onClose: () => void;
  onUpdateNotes: (appointmentId: string, notes: string) => Promise<void>;
  onUpdateStatus?: (
    appointmentId: string,
    status: 'confirmed' | 'completed' | 'cancelled'
  ) => Promise<void>;
  onReschedule?: (appt: Appointment) => void;
}

function formatReadableDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

/**
 * Strips auto-generated dummy system notes (e.g. payment/mode tags, reschedule audit logs, boilerplates)
 * and returns strictly user-entered clinical notes.
 */
function cleanUserNotes(rawNotes?: string | null): string {
  if (!rawNotes) return '';

  const lines = rawNotes.split('\n');
  const userLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Filter out auto-generated payment / mode dummy notes
    // e.g. "In-Clinic (Offline) • Payment via Cash" or "Online (Google Meet) • Payment via Razorpay"
    if (/(In-Clinic|Online).+Payment via/i.test(trimmed)) {
      return false;
    }
    if (/^Payment via (Cash|UPI|Card|NetBanking|Razorpay|Pending)/i.test(trimmed)) {
      return false;
    }

    // Filter out auto-generated reschedule audit logs
    // e.g. "[Rescheduled on 15/10/2026: moved from ...]"
    if (/^\[Rescheduled on [^\]]+\]$/i.test(trimmed)) {
      return false;
    }

    // Filter out default boilerplates
    if (/^(No additional notes|Please arrive at the clinic|Please join the Google Meet)/i.test(trimmed)) {
      return false;
    }

    return true;
  });

  return userLines.join('\n').trim();
}

export default function PatientHistoryModal({
  patient,
  onClose,
  onUpdateNotes,
}: PatientHistoryModalProps) {
  // Sort appointments chronologically descending (latest appointment on top)
  const sortedAppointments = useMemo(() => {
    if (!patient?.appointments) return [];
    return [...patient.appointments].sort((a, b) => {
      const keyA = `${a.date || ''}T${a.time || ''}`;
      const keyB = `${b.date || ''}T${b.time || ''}`;
      return keyB.localeCompare(keyA);
    });
  }, [patient?.appointments]);

  // Selected appointment ID (defaults to latest appointment at index 0)
  const [selectedApptId, setSelectedApptId] = useState<string>('');
  
  // Per-appointment draft notes (preserves un-saved typing when switching appointments)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedNote, setCopiedNote] = useState(false);

  // Auto-select latest appointment when patient changes or appointments update
  useEffect(() => {
    if (sortedAppointments.length > 0) {
      if (!selectedApptId || !sortedAppointments.some((a) => a.id === selectedApptId)) {
        setSelectedApptId(sortedAppointments[0].id);
      }
    }
  }, [sortedAppointments, selectedApptId]);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!patient) return null;

  const totalSpent = patient.appointments
    .filter((a) => a.paymentStatus === 'paid' && a.status !== 'cancelled')
    .reduce((sum, a) => sum + (a.amount || 800), 0);

  // Selected appointment object
  const selectedAppt =
    sortedAppointments.find((a) => a.id === selectedApptId) || sortedAppointments[0];

  const selectedApptIndex = selectedAppt
    ? sortedAppointments.findIndex((a) => a.id === selectedAppt.id)
    : -1;

  // Visit number: total - index (e.g., latest of 3 visits is Visit #3)
  const selectedVisitNumber =
    selectedApptIndex >= 0 ? sortedAppointments.length - selectedApptIndex : 1;

  // Normalization helpers for patient identity comparisons
  const normalizeName = (s?: string) => (s || '').trim().toLowerCase();
  const normalizePhone = (s?: string) => (s || '').replace(/\D/g, '').slice(-10);

  // Detect whether this patient record contains multiple appointments with different booked names or mobile numbers
  const hasDiverseIdentities = useMemo(() => {
    if (!patient?.appointments || patient.appointments.length <= 1) return false;

    const names = new Set(
      patient.appointments
        .map((a) => normalizeName(a.fullName))
        .filter(Boolean)
    );
    const phones = new Set(
      patient.appointments
        .map((a) => normalizePhone(a.phone))
        .filter(Boolean)
    );

    return names.size > 1 || phones.size > 1;
  }, [patient?.appointments]);

  const primaryName = normalizeName(patient?.fullName);
  const primaryPhone = normalizePhone(patient?.phone);

  const selectedName = normalizeName(selectedAppt?.fullName);
  const selectedPhone = normalizePhone(selectedAppt?.phone);
  const isSelectedDifferent =
    Boolean(selectedName && primaryName && selectedName !== primaryName) ||
    Boolean(selectedPhone && primaryPhone && selectedPhone !== primaryPhone);

  const showSelectedBookingIdentity = hasDiverseIdentities || isSelectedDifferent;

  // Saved user-entered notes (cleaned of dummy system text)
  const savedUserNotes = selectedAppt ? cleanUserNotes(selectedAppt.notes) : '';

  // Current note text in editor (draft if typed, else cleaned saved note)
  const currentNoteText =
    selectedAppt && (noteDrafts[selectedAppt.id] !== undefined
      ? noteDrafts[selectedAppt.id]
      : savedUserNotes);

  // Dirty check: has user modified the note without saving?
  const isDirty =
    selectedAppt &&
    noteDrafts[selectedAppt.id] !== undefined &&
    noteDrafts[selectedAppt.id] !== savedUserNotes;

  const handleNoteChange = (text: string) => {
    if (!selectedAppt) return;
    setNoteDrafts((prev) => ({
      ...prev,
      [selectedAppt.id]: text,
    }));
    setSaveSuccess(false);
  };

  const handleSaveNotes = async () => {
    if (!selectedAppt) return;
    setSavingNotes(true);
    try {
      await onUpdateNotes(selectedAppt.id, (currentNoteText || '').trim());
      // Clear draft for this appointment since it is now persisted
      setNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[selectedAppt.id];
        return next;
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save clinical notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleCopyNotes = async () => {
    if (!currentNoteText) return;
    try {
      await navigator.clipboard.writeText(currentNoteText);
      setCopiedNote(true);
      toast.info('Clinical notes copied to clipboard.', 'Copied to Clipboard');
      setTimeout(() => setCopiedNote(false), 2000);
    } catch {
      toast.error('Unable to copy notes to clipboard.', 'Copy Failed');
    }
  };

  const handleRevertDraft = () => {
    if (!selectedAppt) return;
    setNoteDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedAppt.id];
      return next;
    });
    setSaveSuccess(false);
  };

  return (
    <div
      className="admin-drawer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-drawer-title"
    >
      <aside
        className="admin-drawer-panel admin-drawer-panel-patient"
        style={{ width: 'min(1200px, 85vw)', maxWidth: '1250px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <header className="drawer-header patient-drawer-header">
          <div className="patient-drawer-top">
            <div className="patient-avatar-circle patient-drawer-avatar">
              {patient.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="patient-drawer-identity">
              <div className="patient-drawer-name-row">
                <h3 id="patient-drawer-title" className="patient-drawer-name">
                  {patient.fullName}
                </h3>
                {patient.age && (
                  <span className="patient-drawer-age-pill">Age: {patient.age}</span>
                )}
              </div>
              <div className="patient-drawer-contacts">
                {patient.phone && (
                  <a
                    href={`tel:${patient.phone}`}
                    className="patient-contact-chip"
                    title="Call patient"
                  >
                    <IconPhone size={12} />
                    <span>{patient.phone}</span>
                  </a>
                )}
                {patient.email && (
                  <a
                    href={`mailto:${patient.email}`}
                    className="patient-contact-chip"
                    title="Send email"
                  >
                    <IconMail size={12} />
                    <span className="truncate-text">{patient.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-drawer-close"
            onClick={onClose}
            aria-label="Close patient record"
            title="Close (Esc)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Patient Key Metrics Banner */}
        <div className="patient-drawer-kpis">
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">Total Visits</span>
            <strong className="kpi-tile-val">
              {patient.appointments.length} Consult{patient.appointments.length === 1 ? '' : 's'}
            </strong>
          </div>
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">Lifetime Spend</span>
            <strong className="kpi-tile-val highlight-green">
              ₹{totalSpent.toLocaleString('en-IN')}
            </strong>
          </div>
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">First Visit</span>
            <span className="kpi-tile-date">
              {formatReadableDate(sortedAppointments[sortedAppointments.length - 1]?.date)}
            </span>
          </div>
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">Latest Visit</span>
            <span className="kpi-tile-date highlight-accent">
              {formatReadableDate(sortedAppointments[0]?.date)}
            </span>
          </div>
        </div>

        {/* 2-Column Split Body: Left List (Latest on Top) & Right Note Editor */}
        <div className="patient-drawer-body">
          {sortedAppointments.length === 0 ? (
            <div className="patient-drawer-empty-state">
              <IconStethoscope size={40} />
              <h4>No Consultation History</h4>
              <p>No past or upcoming appointments recorded for this patient.</p>
            </div>
          ) : (
            <div className="patient-drawer-split-layout">
              {/* LEFT COLUMN: Sequential Appointments List (Latest on Top) */}
              <aside className="patient-drawer-left-list" aria-label="Appointments List">
                <div className="patient-drawer-list-header">
                  <div className="list-header-title-row">
                    <span className="list-header-title">
                      <IconStethoscope size={15} />
                      <strong>Consultations</strong>
                    </span>
                    <span className="list-header-badge">
                      {sortedAppointments.length} Visit{sortedAppointments.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="list-header-subtitle">
                    {hasDiverseIdentities
                      ? 'Multiple attendees booked under this email. Each card displays the attendee name & mobile.'
                      : 'Latest visit on top. Click an appointment to view and edit clinical notes.'}
                  </p>
                </div>

                <div className="patient-drawer-list-scroll">
                  {sortedAppointments.map((appt, idx) => {
                    const visitNum = sortedAppointments.length - idx;
                    const isSelected = selectedAppt?.id === appt.id;
                    const isLatest = idx === 0;
                    const isFirst = idx === sortedAppointments.length - 1 && sortedAppointments.length > 1;
                    
                    // Check if user-entered notes exist for this appointment (including unsaved draft)
                    const cleanSavedNotes = cleanUserNotes(appt.notes);
                    const apptNote =
                      noteDrafts[appt.id] !== undefined ? noteDrafts[appt.id] : cleanSavedNotes;
                    const hasNotes = Boolean(apptNote && apptNote.trim().length > 0);
                    const hasUnsavedDraft =
                      noteDrafts[appt.id] !== undefined && noteDrafts[appt.id] !== cleanSavedNotes;

                    // Attendee identity check for this booking
                    const apptName = normalizeName(appt.fullName);
                    const apptPhone = normalizePhone(appt.phone);
                    const isDifferentFromPrimary =
                      Boolean(apptName && primaryName && apptName !== primaryName) ||
                      Boolean(apptPhone && primaryPhone && apptPhone !== primaryPhone);
                    const showBookingIdentity = hasDiverseIdentities || isDifferentFromPrimary;

                    return (
                      <div
                        key={appt.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedApptId(appt.id);
                          setSaveSuccess(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedApptId(appt.id);
                            setSaveSuccess(false);
                          }
                        }}
                        className={`patient-appt-item ${isSelected ? 'is-selected' : ''}`}
                      >
                        {/* Item Top Bar */}
                        <div className="appt-item-top">
                          <div className="appt-item-badges">
                            <span className="appt-session-number">
                              #{visitNum}
                            </span>
                            {isLatest && (
                              <span className="appt-pill-latest">Latest</span>
                            )}
                            {isFirst && (
                              <span className="appt-pill-first">First Visit</span>
                            )}
                          </div>

                          {/* Payment status badge */}
                          <span className={`payment-pill pill-${appt.paymentStatus || 'paid'}`}>
                            {appt.paymentStatus === 'paid'
                              ? `Paid ₹${appt.amount || 800}`
                              : appt.paymentStatus === 'refunded'
                              ? 'Refunded'
                              : 'Pending'}
                          </span>
                        </div>

                        {/* Date, Time & Mode */}
                        <div className="appt-item-datetime">
                          <strong className="appt-date-text">
                            {formatReadableDate(appt.date)}
                          </strong>
                          <span className="appt-time-text">
                            <IconClock size={11} />
                            {appt.time}
                          </span>

                          {/* Mode tag */}
                          {appt.consultationType !== 'offline' && appt.meetLink ? (
                            <span className="appt-mode-chip mode-online" title="Online Meet Consultation">
                              <IconVideo size={11} />
                              <span>Meet</span>
                            </span>
                          ) : (
                            <span className="appt-mode-chip mode-clinic" title="In-Clinic Visit">
                              <IconBuilding size={11} />
                              <span>In-Clinic</span>
                            </span>
                          )}
                        </div>

                        {/* Booked Attendee Name & Mobile (when multiple appointments have different names or phones under this email) */}
                        {showBookingIdentity && (
                          <div className="appt-item-booked-for">
                            <div className="booked-for-main">
                              <span className="booked-for-icon" title="Booked Patient Name">
                                <IconUsers size={12} />
                              </span>
                              <span className="booked-for-label">Patient:</span>
                              <strong className="booked-for-name" title={appt.fullName || '—'}>
                                {appt.fullName || '—'}
                              </strong>
                              {appt.age ? (
                                <span className="booked-for-age">({appt.age}y)</span>
                              ) : null}
                              {isDifferentFromPrimary && (
                                <span
                                  className="booked-for-diff-badge"
                                  title="Attendee name or mobile differs from primary account"
                                >
                                  Alt Attendee
                                </span>
                              )}
                            </div>
                            {appt.phone && (
                              <div className="booked-for-phone-wrap" title="Booking Mobile Number">
                                <IconPhone size={11} />
                                <span className="booked-for-phone">{appt.phone}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Health Concern / Reason */}
                        <div className="appt-item-concern">
                          <span className="concern-label">Concern:</span>
                          <span className="concern-val">{appt.reason}</span>
                        </div>

                        {/* Notes Status Indicator */}
                        <div className="appt-item-notes-status">
                          {hasUnsavedDraft ? (
                            <span className="appt-note-badge badge-unsaved">
                              <span className="indicator-dot amber"></span>
                              Unsaved Edits
                            </span>
                          ) : hasNotes ? (
                            <span className="appt-note-badge badge-recorded">
                              <IconCheck size={11} />
                              Notes Recorded
                            </span>
                          ) : (
                            <span className="appt-note-badge badge-empty">
                              <IconPlus />
                              No Notes Yet
                            </span>
                          )}

                          {isSelected && (
                            <span className="appt-viewing-tag">Active →</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>

              {/* RIGHT COLUMN: Note Editor & Consultation Detail */}
              <main className="patient-drawer-right-editor" aria-label="Clinical Note Editor">
                {selectedAppt ? (
                  <>
                    {/* Active Consultation Header Card */}
                    <div className="selected-appt-header-card">
                      <div className="selected-appt-title-row">
                        <div className="selected-appt-title-wrap">
                          <span className="selected-appt-session-badge">
                            Visit #{selectedVisitNumber}
                          </span>
                          <div className="selected-appt-heading">
                            <h4>
                              Consultation on {formatReadableDate(selectedAppt.date)}
                            </h4>
                            <span className="selected-appt-time">
                              <IconClock size={12} />
                              {selectedAppt.time}
                            </span>
                          </div>
                        </div>

                        {/* Mode & Meet Link */}
                        <div className="selected-appt-actions">
                          {selectedAppt.consultationType !== 'offline' && selectedAppt.meetLink ? (
                            <a
                              href={selectedAppt.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="history-mode-pill mode-online selected-meet-btn"
                              title="Open Google Meet link"
                            >
                              <IconVideo size={13} />
                              <span>Join Google Meet</span>
                            </a>
                          ) : (
                            <span className="history-mode-pill mode-clinic">
                              <IconBuilding size={13} />
                              <span>In-Clinic Visit</span>
                            </span>
                          )}

                          <span className={`payment-pill pill-${selectedAppt.paymentStatus || 'paid'}`}>
                            {selectedAppt.paymentStatus === 'paid'
                              ? `Paid ₹${selectedAppt.amount || 800}`
                              : selectedAppt.paymentStatus === 'refunded'
                              ? 'Refunded'
                              : 'Pending'}
                          </span>
                        </div>
                      </div>

                      {/* Attendee details banner when multiple individuals share this email */}
                      {showSelectedBookingIdentity && (
                        <div className="selected-appt-attendee-card">
                          <div className="attendee-card-left">
                            <span className="attendee-card-icon" title="Consultation Patient">
                              <IconUsers size={14} />
                            </span>
                            <span className="attendee-card-label">Consultation For:</span>
                            <strong className="attendee-card-name">
                              {selectedAppt.fullName || '—'}
                            </strong>
                            {selectedAppt.age ? (
                              <span className="attendee-card-age">Age {selectedAppt.age}</span>
                            ) : null}
                            {selectedAppt.phone && (
                              <a
                                href={`tel:${selectedAppt.phone}`}
                                className="attendee-card-phone"
                                title="Call attendee"
                              >
                                <IconPhone size={11} />
                                <span>{selectedAppt.phone}</span>
                              </a>
                            )}
                          </div>
                          {isSelectedDifferent && (
                            <span className="attendee-diff-badge">
                              Family / Alternate Attendee
                            </span>
                          )}
                        </div>
                      )}

                      {/* Concern & Patient Query */}
                      <div className="selected-appt-details-row">
                        <div className="selected-appt-concern">
                          <span className="detail-tag-label">Health Concern:</span>
                          <span className="reason-pill">{selectedAppt.reason}</span>
                        </div>

                        {selectedAppt.message && (
                          <div className="selected-appt-patient-query">
                            <span className="query-label">Patient Query:</span>
                            <span className="query-text">
                              &ldquo;{selectedAppt.message}&rdquo;
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dedicated Clinical & Prescription Notes Workspace */}
                    <div className="clinical-notes-editor-box">
                      <div className="notes-box-header">
                        <div className="notes-box-title">
                          <span className="notes-icon-box" aria-hidden="true">
                            <IconStethoscope size={16} />
                          </span>
                          <div>
                            <strong>Doctor Clinical Findings &amp; Prescription (Rx)</strong>
                            <p className="notes-box-subtitle">
                              Document diagnosis, treatment given, medicines, and follow-up instructions.
                            </p>
                          </div>
                        </div>

                        <div className="notes-status-indicator">
                          {isDirty ? (
                            <span className="notes-badge-tag tag-dirty">
                              ● Unsaved changes
                            </span>
                          ) : savedUserNotes ? (
                            <span className="notes-badge-tag tag-saved">
                              <IconCheck size={11} /> Saved
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Textarea Note Editor */}
                      <div className="editor-textarea-wrapper">
                        <textarea
                          value={currentNoteText}
                          onChange={(e) => handleNoteChange(e.target.value)}
                          placeholder="Enter examination findings, treatment given, medicines, diet advice and follow-up guidance..."
                          rows={9}
                          className="clinical-notes-textarea clinical-notes-textarea-master"
                        />
                      </div>

                      {/* Editor Action Toolbar */}
                      <div className="notes-editor-toolbar">
                        <div className="toolbar-left">
                          <span className="notes-char-count">
                            {currentNoteText ? currentNoteText.length : 0} characters
                          </span>

                          {saveSuccess && (
                            <span className="save-success-banner">
                              <IconCheck size={13} /> Notes saved successfully!
                            </span>
                          )}
                        </div>

                        <div className="toolbar-right">
                          {currentNoteText && (
                            <button
                              type="button"
                              className="btn-copy-note"
                              onClick={handleCopyNotes}
                              title="Copy clinical notes to clipboard"
                            >
                              {copiedNote ? (
                                <>
                                  <IconCheck size={12} />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <IconCopy size={12} />
                                  <span>Copy Notes</span>
                                </>
                              )}
                            </button>
                          )}

                          {isDirty && (
                            <button
                              type="button"
                              className="btn-cancel-clinical-notes"
                              onClick={handleRevertDraft}
                              disabled={savingNotes}
                              title="Discard un-saved changes"
                            >
                              Revert
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn-save-clinical-notes"
                            disabled={savingNotes}
                            onClick={handleSaveNotes}
                          >
                            {savingNotes ? (
                              <>
                                <IconRefresh size={13} />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <IconCheck size={13} />
                                <span>Save Clinical Notes</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="editor-empty-prompt">
                    <IconStethoscope size={32} />
                    <p>Select an appointment from the left list to view or edit notes.</p>
                  </div>
                )}
              </main>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <footer className="patient-drawer-footer">
          <div className="drawer-footer-info">
            <span>
              Patient Record: <strong>{patient.fullName}</strong> &bull; {patient.appointments.length}{' '}
              Consultation{patient.appointments.length === 1 ? '' : 's'} Total
            </span>
          </div>
          <button type="button" className="btn-patient-drawer-close" onClick={onClose}>
            Close Record
          </button>
        </footer>
      </aside>
    </div>
  );
}
