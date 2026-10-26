'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { setClinicSettingsCache, useClinicSettings } from '@/lib/useClinicSettings';
import {
  ClinicSettings,
  DEFAULT_LOCATION,
  DaySchedule,
  MAX_BUFFER,
  MAX_DURATION,
  MAX_LOCATION_LENGTH,
  MIN_DURATION,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_NAMES,
  formatSlotLabel,
  generateSlots,
  normalizeClinicSettings,
} from '@/lib/slots';

const DURATION_PRESETS = [10, 15, 20, 30, 45, 60];
const BUFFER_PRESETS = [0, 5, 10, 15, 20, 30];

interface Draft {
  slotDuration: string;
  bufferTime: string;
  /** Index = JS weekday (0 = Sunday ... 6 = Saturday). */
  weekly: DaySchedule[];
}

function toDraft(settings: ClinicSettings): Draft {
  return {
    slotDuration: String(settings.slotDuration),
    bufferTime: String(settings.bufferTime),
    weekly: settings.weekly.map((d) => ({
      closed: d.closed,
      sessions: d.sessions.map((s) => ({ ...s, location: s.location || DEFAULT_LOCATION })),
    })),
  };
}

interface SlotSettingsCardProps {
  onSaved?: () => void | Promise<void>;
}

export default function SlotSettingsCard({ onSaved }: SlotSettingsCardProps) {
  const { settings, isLoaded } = useClinicSettings();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [isSaving, setIsSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const touched = useRef(false);

  // Once the saved settings arrive from the server, show them (unless admin already started editing)
  useEffect(() => {
    if (isLoaded && !touched.current) {
      setDraft(toDraft(settings));
    }
  }, [isLoaded, settings]);

  const update = (patch: Partial<Draft>) => {
    touched.current = true;
    setWarning(null);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  // ---- Single "add timing" form -------------------------------------------------
  const [formDays, setFormDays] = useState<number[]>([1]);
  const [formStart, setFormStart] = useState('09:30');
  const [formEnd, setFormEnd] = useState('13:00');
  const [formLocation, setFormLocation] = useState(DEFAULT_LOCATION);
  const [editing, setEditing] = useState<{ dow: number; index: number } | null>(null);
  const [formError, setFormError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const toggleFormDay = (dow: number) => {
    setFormError('');
    setFormDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]));
  };

  const resetForm = () => {
    setEditing(null);
    setFormError('');
    setFormDays([1]);
    setFormStart('09:30');
    setFormEnd('13:00');
    setFormLocation(DEFAULT_LOCATION);
  };

  const handleSubmitTiming = () => {
    setFormError('');
    if (formDays.length === 0) {
      setFormError('Select at least one day.');
      return;
    }
    const location = formLocation.trim() || DEFAULT_LOCATION;

    // Start from the current weekly list (minus the entry being edited)
    const next: DaySchedule[] = draft.weekly.map((d, i) => ({
      closed: d.closed,
      sessions: d.sessions.filter((_, idx) => !(editing && editing.dow === i && editing.index === idx)),
    }));
    for (const dow of formDays) {
      next[dow].closed = false;
      next[dow].sessions.push({ start: formStart, end: formEnd, location });
    }

    // Validate times, overlaps and minimum length with the shared rules
    const check = normalizeClinicSettings({
      slotDuration: Number(draft.slotDuration),
      bufferTime: Number(draft.bufferTime),
      weekly: next.map((d) => ({ closed: d.sessions.length === 0, sessions: d.sessions })),
    });
    if (!check.settings) {
      setFormError(check.error || 'Please check the timing.');
      return;
    }
    update({ weekly: check.settings.weekly.map((d) => ({ ...d })) });
    resetForm();
  };

  const handleEditTiming = (dow: number, index: number) => {
    const session = draft.weekly[dow].sessions[index];
    setEditing({ dow, index });
    setFormDays([dow]);
    setFormStart(session.start);
    setFormEnd(session.end);
    setFormLocation(session.location || DEFAULT_LOCATION);
    setFormError('');
  };

  const handleRemoveTiming = (dow: number, index: number) => {
    const sessions = draft.weekly[dow].sessions.filter((_, i) => i !== index);
    update({
      weekly: draft.weekly.map((d, i) => (i === dow ? { closed: sessions.length === 0, sessions } : d)),
    });
    if (editing) resetForm();
  };

  /** Flat list of everything entered, Monday first. */
  const entries = useMemo(
    () =>
      WEEKDAY_DISPLAY_ORDER.flatMap((dow) =>
        draft.weekly[dow].sessions.map((session, index) => ({ dow, index, session }))
      ),
    [draft.weekly]
  );
  const closedDayNames = WEEKDAY_DISPLAY_ORDER.filter((d) => draft.weekly[d].sessions.length === 0).map(
    (d) => WEEKDAY_NAMES[d]
  );

  // Locations already used, offered as suggestions in the location field
  const knownLocations = useMemo(() => {
    const set = new Set<string>([DEFAULT_LOCATION]);
    draft.weekly.forEach((d) => d.sessions.forEach((x) => x.location && set.add(x.location)));
    return Array.from(set);
  }, [draft.weekly]);

  const validation = useMemo(
    () =>
      normalizeClinicSettings({
        slotDuration: draft.slotDuration === '' ? NaN : Number(draft.slotDuration),
        bufferTime: draft.bufferTime === '' ? NaN : Number(draft.bufferTime),
        weekly: draft.weekly,
      }),
    [draft]
  );

  const previewSlots = useMemo(
    () =>
      validation.settings
        ? WEEKDAY_DISPLAY_ORDER.map((dow) => {
            // any real date of that weekday works for a preview
            const sample = `2026-11-${String(1 + dow).padStart(2, '0')}`; // 1 Nov 2026 is a Sunday
            return { dow, slots: generateSlots(validation.settings as ClinicSettings, sample) };
          })
        : [],
    [validation.settings]
  );
  const totalPreviewSlots = previewSlots.reduce((n, d) => n + d.slots.length, 0);

  const isDirty = useMemo(() => {
    const saved = toDraft(settings);
    return JSON.stringify(saved) !== JSON.stringify(draft);
  }, [settings, draft]);

  const handleReset = () => {
    touched.current = false;
    setWarning(null);
    setDraft(toDraft(settings));
  };

  const handleSave = async () => {
    if (!validation.settings) {
      toast.warning(validation.error || 'Please check the settings.', 'Invalid Settings');
      return;
    }

    setIsSaving(true);
    setWarning(null);
    try {
      const accessToken =
        typeof window !== 'undefined' ? localStorage.getItem('admin_access_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch('/api/clinic-settings', {
        method: 'PUT',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(validation.settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save appointment settings.');

      touched.current = false;
      setClinicSettingsCache(data.settings as ClinicSettings);
      setDraft(toDraft(data.settings as ClinicSettings));

      toast.success(
        `Weekly schedule saved: ${data.settings.slotDuration} min appointments with ${data.settings.bufferTime} min buffer.`,
        'Settings Saved'
      );

      if (typeof data.offGridCount === 'number' && data.offGridCount > 0) {
        setWarning(
          `${data.offGridCount} upcoming appointment${
            data.offGridCount === 1 ? '' : 's'
          } were booked at times that are not in the new weekly schedule. They stay valid and still block overlapping slots, but you may want to reschedule them.`
        );
      }

      await onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save appointment settings.';
      toast.error(message, 'Save Failed');
    } finally {
      setIsSaving(false);
    }
  };

  const durationNum = Number(draft.slotDuration);
  const bufferNum = Number(draft.bufferTime);

  return (
    <div className="availability-card slot-settings-card">
      <style>{`
        .slot-settings-card { margin-bottom: 24px; }
        .slot-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 18px; }
        .slot-settings-block label.slot-settings-label { display: block; font-weight: 700; font-size: 13px; margin-bottom: 8px; }
        .slot-settings-presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .slot-settings-preset {
          padding: 7px 14px; border-radius: 999px; border: 1.5px solid var(--line, #e2e8f0);
          background: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
        }
        .slot-settings-preset.active { background: var(--primary, #565ACF); border-color: var(--primary, #565ACF); color: #fff; }
        .slot-settings-custom { display: flex; align-items: center; gap: 8px; }
        .slot-settings-custom .admin-input { max-width: 120px; }
        .slot-settings-sessions { margin-top: 22px; }
        .slot-settings-session-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .slot-settings-session-row .admin-input { max-width: 150px; }
        .slot-settings-remove {
          border: none; background: #fee2e2; color: #b91c1c; border-radius: 8px;
          padding: 8px 12px; cursor: pointer; font-weight: 600; font-size: 13px;
        }
        .slot-settings-remove:disabled { opacity: 0.4; cursor: not-allowed; }
        .slot-settings-add {
          border: 1.5px dashed var(--primary, #565ACF); background: transparent; color: var(--primary, #565ACF);
          border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 600; font-size: 13px;
        }
        .slot-settings-add:disabled { opacity: 0.4; cursor: not-allowed; }
        .slot-settings-preview { margin-top: 22px; }
        .slot-settings-preview-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .slot-settings-preview-chip {
          padding: 6px 12px; border-radius: 8px; background: var(--primary-light, #EEF0FF);
          color: var(--primary-dark, #1F2278); font-size: 13px; font-weight: 600;
        }
        .slot-settings-error { color: #b91c1c; font-size: 13px; margin-top: 12px; font-weight: 600; }
        .slot-settings-warning {
          margin-top: 14px; padding: 10px 14px; border-radius: 10px; background: #fef3c7;
          color: #92400e; font-size: 13px;
        }
        .slot-settings-actions { display: flex; gap: 12px; margin-top: 22px; flex-wrap: wrap; }
        .slot-settings-actions .btn-save-override { padding: 11px 26px; }
        .slot-settings-reset {
          padding: 11px 22px; border-radius: 10px; border: 1.5px solid var(--line, #e2e8f0);
          background: #fff; cursor: pointer; font-weight: 600;
        }
        .slot-settings-reset:disabled { opacity: 0.5; cursor: not-allowed; }
        .timing-form { border: 1.5px solid var(--line, #e2e8f0); border-radius: 12px; padding: 14px; background: #fff; }
        .timing-form-days { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .timing-day-chip { padding: 7px 14px; border-radius: 999px; border: 1.5px solid var(--line, #e2e8f0); background: #fff; cursor: pointer; font-size: 13px; font-weight: 600; }
        .timing-day-chip.active { background: var(--primary, #565ACF); border-color: var(--primary, #565ACF); color: #fff; }
        .timing-day-chip:disabled { cursor: not-allowed; opacity: 0.6; }
        .timing-form-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
        .timing-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #475569; }
        .timing-field .admin-input { max-width: 150px; }
        .timing-field-grow { flex: 1 1 200px; }
        .timing-field-grow .admin-input { max-width: none; }
        .timing-form-buttons { display: flex; gap: 8px; }
        .timing-form-buttons .btn-save-override, .timing-form-buttons .slot-settings-reset { padding: 10px 22px; }
        .timing-table-wrap { overflow: auto; max-height: 240px; margin-top: 8px; border: 1.5px solid var(--line, #e2e8f0); border-radius: 10px; }
        .timing-table-wrap table { margin: 0; }
        .timing-table-wrap thead th { position: sticky; top: 0; z-index: 1; background: #f8fafc; }
        .slot-settings-preview-scroll { max-height: 260px; overflow-y: auto; padding-right: 6px; }
        .timing-row-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .weekday-copy-btn { border: 1.5px solid var(--line, #e2e8f0); background: #fff; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 600; font-size: 13px; }
        .weekday-copy-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .weekday-preview-row { display: flex; gap: 12px; align-items: flex-start; margin-top: 10px; }
        .weekday-preview-name { min-width: 92px; font-size: 13px; font-weight: 700; padding-top: 6px; }
        .weekday-preview-closed { font-size: 13px; color: #94a3b8; padding-top: 6px; }
        @media (max-width: 720px) { .slot-settings-grid { grid-template-columns: 1fr; } }
      `}</style>

      <h3 className="card-heading">Doctor Timings &amp; Location</h3>
      <p className="card-subhead">
        Choose how long each appointment lasts, the gap between appointments, and the day-wise
        timings with the location where the doctor will be visiting. Slots on the booking page, admin
        calendar and reschedule window update automatically.
      </p>

      <div className="slot-settings-grid">
        <div className="slot-settings-block">
          <label className="slot-settings-label">Appointment length (minutes)</label>
          <div className="slot-settings-presets">
            {DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={`slot-settings-preset ${durationNum === m ? 'active' : ''}`}
                onClick={() => update({ slotDuration: String(m) })}
              >
                {m} min
              </button>
            ))}
          </div>
          <div className="slot-settings-custom">
            <input
              type="number"
              className="admin-input"
              min={MIN_DURATION}
              max={MAX_DURATION}
              value={draft.slotDuration}
              onChange={(e) => update({ slotDuration: e.target.value })}
              aria-label="Custom appointment length in minutes"
            />
            <span className="field-hint">custom ({MIN_DURATION}-{MAX_DURATION} min)</span>
          </div>
        </div>

        <div className="slot-settings-block">
          <label className="slot-settings-label">Buffer between appointments (minutes)</label>
          <div className="slot-settings-presets">
            {BUFFER_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={`slot-settings-preset ${bufferNum === m && draft.bufferTime !== '' ? 'active' : ''}`}
                onClick={() => update({ bufferTime: String(m) })}
              >
                {m === 0 ? 'No buffer' : `${m} min`}
              </button>
            ))}
          </div>
          <div className="slot-settings-custom">
            <input
              type="number"
              className="admin-input"
              min={0}
              max={MAX_BUFFER}
              value={draft.bufferTime}
              onChange={(e) => update({ bufferTime: e.target.value })}
              aria-label="Custom buffer time in minutes"
            />
            <span className="field-hint">custom (0-{MAX_BUFFER} min)</span>
          </div>
        </div>
      </div>

      <div className="slot-settings-sessions">
        <label className="slot-settings-label" style={{ fontWeight: 700, fontSize: 13 }}>
          {editing ? `Edit timing (${WEEKDAY_NAMES[editing.dow]})` : 'Add doctor timing'}
        </label>

        <div className="timing-form">
          <div className="timing-form-days" role="group" aria-label="Days">
            {WEEKDAY_DISPLAY_ORDER.map((dow) => (
              <button
                key={dow}
                type="button"
                disabled={!!editing}
                className={`timing-day-chip ${formDays.includes(dow) ? 'active' : ''}`}
                onClick={() => toggleFormDay(dow)}
                title={WEEKDAY_NAMES[dow]}
              >
                {WEEKDAY_NAMES[dow].slice(0, 3)}
              </button>
            ))}
          </div>

          <div className="timing-form-row">
            <div className="timing-field">
              <span>From</span>
              <input
                type="time"
                className="admin-input"
                value={formStart}
                onChange={(e) => {
                  setFormError('');
                  setFormStart(e.target.value);
                }}
              />
            </div>
            <div className="timing-field">
              <span>To</span>
              <input
                type="time"
                className="admin-input"
                value={formEnd}
                onChange={(e) => {
                  setFormError('');
                  setFormEnd(e.target.value);
                }}
              />
            </div>
            <div className="timing-field timing-field-grow">
              <span>Location</span>
              <input
                type="text"
                list="doctor-location-options"
                className="admin-input"
                placeholder="e.g. Akurdi Clinic"
                maxLength={MAX_LOCATION_LENGTH}
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
              />
              <datalist id="doctor-location-options">
                {knownLocations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>
            <div className="timing-form-buttons">
              <button type="button" className="btn btn-save-override" onClick={handleSubmitTiming}>
                {editing ? 'Update' : 'Add'}
              </button>
              {editing && (
                <button type="button" className="slot-settings-reset" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </div>
          {formError && <div className="slot-settings-error">{formError}</div>}
        </div>

        <label className="slot-settings-label" style={{ fontWeight: 700, fontSize: 13, marginTop: 20 }}>
          Entered timings
        </label>
        {entries.length === 0 ? (
          <p className="field-hint">No timings added yet. Use the form above to add one.</p>
        ) : (
          <div className="timing-table-wrap">
            <table className="admin-table timing-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map(({ dow, index, session }) => (
                  <tr key={`${dow}-${index}`}>
                    <td>
                      <strong>{WEEKDAY_NAMES[dow]}</strong>
                    </td>
                    <td>
                      {formatSlotLabel(session.start)} - {formatSlotLabel(session.end)}
                    </td>
                    <td>{session.location || DEFAULT_LOCATION}</td>
                    <td className="timing-row-actions">
                      <button type="button" className="weekday-copy-btn" onClick={() => handleEditTiming(dow, index)}>
                        Edit
                      </button>
                      <button type="button" className="slot-settings-remove" onClick={() => handleRemoveTiming(dow, index)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {closedDayNames.length > 0 && entries.length > 0 && (
          <p className="field-hint" style={{ marginTop: 8 }}>
            Closed: {closedDayNames.join(', ')}
          </p>
        )}
      </div>

      {/* Slot preview is hidden until asked for */}
      <div className="slot-settings-preview">
        <button
          type="button"
          className="weekday-copy-btn"
          disabled={!validation.settings}
          onClick={() => setShowPreview((v) => !v)}
          aria-expanded={showPreview}
        >
          {showPreview ? 'Hide slot preview' : 'Preview slots'}
        </button>
        {!validation.settings && <div className="slot-settings-error">{validation.error}</div>}
        {showPreview && validation.settings && (
          <>
            <p className="field-hint" style={{ marginTop: 10 }}>
              {totalPreviewSlots} slot{totalPreviewSlots === 1 ? '' : 's'} per week ({validation.settings.slotDuration} min +{' '}
              {validation.settings.bufferTime} min buffer)
            </p>
            <div className="slot-settings-preview-scroll">
            {previewSlots.map(({ dow, slots }) => (
              <div className="weekday-preview-row" key={dow}>
                <span className="weekday-preview-name">{WEEKDAY_NAMES[dow]}</span>
                {slots.length === 0 ? (
                  <span className="weekday-preview-closed">Closed</span>
                ) : (
                  <div className="slot-settings-preview-chips">
                    {slots.map((slot) => (
                      <span className="slot-settings-preview-chip" key={slot.value} title={slot.location}>
                        {slot.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            </div>
          </>
        )}
      </div>

      {warning && <div className="slot-settings-warning">{warning}</div>}

      <div className="slot-settings-actions">
        <button
          type="button"
          className="btn btn-save-override"
          disabled={isSaving || !isDirty || !validation.settings}
          onClick={handleSave}
        >
          {isSaving ? 'Saving...' : 'Save Appointment Settings'}
        </button>
        <button
          type="button"
          className="slot-settings-reset"
          disabled={isSaving || !isDirty}
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}