'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Appointment } from '@/lib/storage';
import { PatientGroup } from '@/components/admin/types';
import { toast } from '@/components/ui/Toast';
import {
  IconCross,
  IconPhone,
  IconMail,
  IconCopy,
  IconCheck,
  IconVideo,
  IconBuilding,
  IconExternalLink,
  IconClock,
} from './AdminIcons';

type EditableStatus = 'confirmed' | 'completed' | 'cancelled';

interface PatientHistoryModalProps {
  patient: PatientGroup;
  onClose: () => void;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
  onUpdateStatus: (id: string, status: EditableStatus) => Promise<void>;
  onReschedule: (appt: Appointment) => void;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(time?: string) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function sortKey(a: Appointment) {
  return `${a.date}T${a.time}`;
}

export default function PatientHistoryModal({
  patient,
  onClose,
  onUpdateNotes,
  onUpdateStatus,
  onReschedule,
}: PatientHistoryModalProps) {
  // Newest first
  const sorted = useMemo(
    () => [...patient.appointments].sort((a, b) => sortKey(b).localeCompare(sortKey(a))),
    [patient.appointments]
  );

  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => sorted.find((a) => a.id === selectedId) ?? null,
    [sorted, selectedId]
  );

  // Load the saved note into the editor whenever a different visit is selected
  useEffect(() => {
    setDraft(selected?.notes ?? '');
    setJustSaved(false);
    setCopied(false);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const savedNotes = selected?.notes ?? '';
  const isDirty = draft !== savedNotes;

  const stats = useMemo(() => {
    const completed = sorted.filter((a) => a.status === 'completed');
    const spent = sorted
      .filter((a) => a.paymentStatus === 'paid')
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const oldest = sorted[sorted.length - 1];
    const latest = sorted[0];
    return { completed: completed.length, spent, oldest, latest };
  }, [sorted]);

  const handleSave = async () => {
    if (!selected || !isDirty) return;
    setIsSaving(true);
    try {
      await onUpdateNotes(selected.id, draft);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {
      toast.error('Could not save the clinical notes. Please try again.', 'Save Failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Copy is not available in this browser.', 'Copy Failed');
    }
  };

  const handleStatus = async (status: EditableStatus) => {
    if (!selected || selected.status === status) return;
    try {
      await onUpdateStatus(selected.id, status);
    } catch {
      toast.error('Could not update the appointment status.', 'Update Failed');
    }
  };

  const initial = patient.fullName?.trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className="admin-drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-drawer-panel admin-drawer-panel-patient" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="patient-drawer-header">
          <div className="patient-drawer-top">
            <div className="patient-drawer-avatar patient-avatar-circle">{initial}</div>
            <div className="patient-drawer-identity">
              <div className="patient-drawer-name-row">
                <h3 className="patient-drawer-name">{patient.fullName}</h3>
                <span className="patient-drawer-age-pill">{patient.age} yrs</span>
              </div>
              <div className="patient-drawer-contacts">
                <a className="patient-contact-chip" href={`tel:${patient.phone}`}>
                  <IconPhone /> {patient.phone}
                </a>
                {patient.email && (
                  <a className="patient-contact-chip" href={`mailto:${patient.email}`}>
                    <IconMail /> {patient.email}
                  </a>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="btn-patient-drawer-close" onClick={onClose} aria-label="Close">
            <IconCross />
          </button>
        </div>

        {/* KPI strip */}
        <div className="patient-drawer-kpis">
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">Total Visits</span>
            <span className="kpi-tile-val">{sorted.length}</span>
          </div>
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">Completed</span>
            <span className="kpi-tile-val">{stats.completed}</span>
          </div>
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">Total Paid</span>
            <span className="kpi-tile-val highlight-accent">₹{stats.spent.toLocaleString('en-IN')}</span>
          </div>
          <div className="patient-kpi-tile">
            <span className="kpi-tile-label">Last Visit</span>
            <span className="kpi-tile-val kpi-tile-date">{formatDate(stats.latest?.date)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="patient-drawer-body">
          {sorted.length === 0 ? (
            <div className="patient-drawer-empty-state">
              <h4>No consultations yet</h4>
              <p>This patient has no appointments on record.</p>
            </div>
          ) : (
            <div className="patient-drawer-split-layout">
              {/* Left: visit list */}
              <div className="patient-drawer-left-list">
                <div className="patient-drawer-list-header">
                  <div className="list-header-title-row">
                    <span className="list-header-title">Consultation History</span>
                    <span className="list-header-badge">{sorted.length}</span>
                  </div>
                  <span className="list-header-subtitle">Select a visit to view or edit its notes</span>
                </div>
                <div className="patient-drawer-list-scroll">
                  {sorted.map((appt, idx) => {
                    const sessionNo = sorted.length - idx;
                    const hasNotes = !!appt.notes?.trim();
                    const isOnline = appt.consultationType === 'online';
                    return (
                      <button
                        key={appt.id}
                        type="button"
                        className={`patient-appt-item${appt.id === selectedId ? ' is-selected' : ''}`}
                        onClick={() => setSelectedId(appt.id)}
                      >
                        <div className="appt-item-top">
                          <span className="appt-session-number">Visit #{sessionNo}</span>
                          <div className="appt-item-badges">
                            {idx === 0 && <span className="appt-pill-latest">Latest</span>}
                            {idx === sorted.length - 1 && sorted.length > 1 && (
                              <span className="appt-pill-first">First</span>
                            )}
                          </div>
                        </div>
                        <div className="appt-item-datetime">
                          <span className="appt-date-text">{formatDate(appt.date)}</span>
                          <span className="appt-time-text">{formatTime(appt.time)}</span>
                        </div>
                        <div className="appt-item-concern">
                          <span className="concern-label">Concern</span>
                          <span className="concern-val">{appt.reason || '—'}</span>
                        </div>
                        <div className="appt-item-notes-status">
                          <span className={`appt-mode-chip ${isOnline ? 'mode-online' : 'mode-clinic'}`}>
                            {isOnline ? 'Online' : 'Clinic'}
                          </span>
                          <span className={`appt-note-badge ${hasNotes ? 'badge-recorded' : 'badge-empty'}`}>
                            {hasNotes ? 'Notes recorded' : 'No notes'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: selected visit */}
              <div className="patient-drawer-right-editor">
                {!selected ? (
                  <div className="editor-empty-prompt">Select a visit from the list to see its details.</div>
                ) : (
                  <>
                    <div className="selected-appt-header-card">
                      <div className="selected-appt-title-row">
                        <div className="selected-appt-title-wrap">
                          <div className="selected-appt-heading">
                            <h4>{formatDate(selected.date)}</h4>
                          </div>
                          <span className="selected-appt-time">
                            <IconClock size={14} /> {formatTime(selected.time)}
                          </span>
                          <span className="selected-appt-session-badge">
                            {selected.consultationType === 'online' ? (
                              <>
                                <IconVideo /> Online
                              </>
                            ) : (
                              <>
                                <IconBuilding /> {selected.location || 'Clinic'}
                              </>
                            )}
                          </span>
                        </div>
                        <div className="selected-appt-actions">
                          {selected.meetLink && selected.status !== 'cancelled' && (
                            <a
                              className="selected-meet-btn"
                              href={selected.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <IconExternalLink /> Join Meet
                            </a>
                          )}
                          {selected.status !== 'completed' && selected.status !== 'cancelled' && (
                            <button
                              type="button"
                              className="btn-cancel-clinical-notes"
                              onClick={() => onReschedule(selected)}
                            >
                              Reschedule
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="selected-appt-details-row">
                        <div className="selected-appt-patient-query">
                          <span className="query-label">Health concern</span>
                          <span className="query-text">{selected.reason || '—'}</span>
                          {selected.message && <span className="query-text">{selected.message}</span>}
                        </div>
                        <div className="selected-appt-concern">
                          <span className="detail-tag-label">Status</span>
                          <select
                            value={selected.status === 'no-show' ? 'cancelled' : selected.status ?? 'confirmed'}
                            onChange={(e) => handleStatus(e.target.value as EditableStatus)}
                          >
                            <option value="confirmed">Confirmed</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="clinical-notes-editor-box">
                      <div className="notes-box-header">
                        <div>
                          <div className="notes-box-title">
                            Clinical notes for <strong>{formatDate(selected.date)}</strong>
                          </div>
                          <div className="notes-box-subtitle">
                            Private to the doctor. Saved against this visit only.
                          </div>
                        </div>
                        <span
                          className={`notes-badge-tag ${isDirty ? 'tag-dirty' : 'tag-saved'}`}
                        >
                          {isDirty ? 'Unsaved changes' : 'Saved'}
                        </span>
                      </div>

                      <div className="editor-textarea-wrapper">
                        <textarea
                          className="clinical-notes-textarea-master"
                          value={draft}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            setJustSaved(false);
                          }}
                          placeholder="Symptoms, examination findings, diagnosis, advice, follow-up plan…"
                        />
                      </div>

                      <div className="notes-editor-toolbar">
                        <div className="toolbar-left">
                          <button
                            type="button"
                            className="btn-copy-note"
                            onClick={handleCopy}
                            disabled={!draft.trim()}
                          >
                            {copied ? <IconCheck /> : <IconCopy />} {copied ? 'Copied' : 'Copy'}
                          </button>
                          {justSaved && <span className="save-success-banner">Notes saved</span>}
                        </div>
                        <div className="toolbar-right">
                          <button
                            type="button"
                            className="btn-cancel-clinical-notes"
                            onClick={() => setDraft(savedNotes)}
                            disabled={!isDirty || isSaving}
                          >
                            Discard
                          </button>
                          <button
                            type="button"
                            className="btn-save-clinical-notes"
                            onClick={handleSave}
                            disabled={!isDirty || isSaving}
                          >
                            {isSaving ? 'Saving…' : 'Save Notes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="patient-drawer-footer">
          <span className="drawer-footer-info">
            {sorted.length} consultation{sorted.length === 1 ? '' : 's'} on record
          </span>
          <button type="button" className="btn-patient-drawer-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}