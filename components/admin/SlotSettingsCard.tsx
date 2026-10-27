'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { setClinicSettingsCache, useClinicSettings } from '@/lib/useClinicSettings';
import {
  ClinicSettings,
  DEFAULT_LOCATION,
  DaySchedule,
  MAX_LOCATIONS,
  MAX_LOCATION_LENGTH,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_NAMES,
  formatSlotLabel,
  getLocations,
  normalizeClinicSettings,
  sameLocation,
} from '@/lib/slots';

const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60];
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30];

interface Draft {
  slotDuration: string;
  bufferTime: string;
  /** Index = JS weekday (0 = Sunday ... 6 = Saturday). */
  weekly: DaySchedule[];
  /** Places the doctor sits; timings can only use these. */
  locations: string[];
}

function toDraft(settings: ClinicSettings): Draft {
  return {
    slotDuration: String(settings.slotDuration),
    bufferTime: String(settings.bufferTime),
    weekly: settings.weekly.map((d) => ({
      closed: d.closed,
      sessions: d.sessions.map((s) => ({ ...s, location: s.location || DEFAULT_LOCATION })),
    })),
    locations: getLocations(settings),
  };
}

/** The usual choices, plus the saved value if it is something else. */
function withCurrent(options: number[], current: string): number[] {
  const n = Number(current);
  if (Number.isInteger(n) && !options.includes(n)) return [...options, n].sort((a, b) => a - b);
  return options;
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

  // ---------------------------------------------------------------- locations
  const [newLocation, setNewLocation] = useState('');
  const [locationError, setLocationError] = useState('');
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);

  const timingsAtLocation = (location: string) =>
    draft.weekly.reduce(
      (n, d) => n + d.sessions.filter((x) => sameLocation(x.location, location)).length,
      0
    );

  const handleAddLocation = () => {
    const name = newLocation.trim().slice(0, MAX_LOCATION_LENGTH);
    if (!name) {
      setLocationError('Type the name of the place first.');
      return;
    }
    if (draft.locations.some((l) => sameLocation(l, name))) {
      setLocationError('This place is already in the list.');
      return;
    }
    if (draft.locations.length >= MAX_LOCATIONS) {
      setLocationError(`You can add up to ${MAX_LOCATIONS} places.`);
      return;
    }
    update({ locations: [...draft.locations, name] });
    setNewLocation('');
    setLocationError('');
  };

  const handleRemoveLocation = (index: number) => {
    const name = draft.locations[index];
    if (draft.locations.length <= 1) {
      setLocationError('Keep at least one place.');
      return;
    }
    const used = timingsAtLocation(name);
    if (
      used > 0 &&
      !window.confirm(
        `Remove "${name}"? Its ${used} timing${used === 1 ? '' : 's'} will be removed too.`
      )
    ) {
      return;
    }
    setLocationError('');
    update({
      locations: draft.locations.filter((_, i) => i !== index),
      weekly: draft.weekly.map((d) => {
        const sessions = d.sessions.filter((x) => !sameLocation(x.location, name));
        return { closed: sessions.length === 0, sessions };
      }),
    });
  };

  const handleSaveRename = () => {
    if (!renaming) return;
    const name = renaming.value.trim().slice(0, MAX_LOCATION_LENGTH);
    const old = draft.locations[renaming.index];
    if (!name) {
      setLocationError('Type the name of the place first.');
      return;
    }
    if (draft.locations.some((l, i) => i !== renaming.index && sameLocation(l, name))) {
      setLocationError('This place is already in the list.');
      return;
    }
    setLocationError('');
    update({
      locations: draft.locations.map((l, i) => (i === renaming.index ? name : l)),
      weekly: draft.weekly.map((d) => ({
        ...d,
        sessions: d.sessions.map((x) => (sameLocation(x.location, old) ? { ...x, location: name } : x)),
      })),
    });
    setRenaming(null);
  };

  // ------------------------------------------------------------------- timings
  // One small form, opened under the day it belongs to.
  const [form, setForm] = useState<{ dow: number; index: number | null } | null>(null);
  const [formStart, setFormStart] = useState('09:30');
  const [formEnd, setFormEnd] = useState('13:00');
  const [formLocation, setFormLocation] = useState('');
  const [formRepeat, setFormRepeat] = useState<number[]>([]);
  const [formError, setFormError] = useState('');

  const effectiveFormLocation =
    draft.locations.find((l) => sameLocation(l, formLocation)) || draft.locations[0] || '';

  const closeForm = () => {
    setForm(null);
    setFormError('');
    setFormRepeat([]);
  };

  const openAdd = (dow: number) => {
    setForm({ dow, index: null });
    setFormStart('09:30');
    setFormEnd('13:00');
    setFormLocation(draft.locations[0] || '');
    setFormRepeat([]);
    setFormError('');
  };

  const openEdit = (dow: number, index: number) => {
    const session = draft.weekly[dow].sessions[index];
    setForm({ dow, index });
    setFormStart(session.start);
    setFormEnd(session.end);
    setFormLocation(session.location || draft.locations[0] || '');
    setFormRepeat([]);
    setFormError('');
  };

  const handleSaveTiming = () => {
    if (!form) return;
    if (!effectiveFormLocation) {
      setFormError('Add a place first.');
      return;
    }
    const days = form.index === null ? [form.dow, ...formRepeat] : [form.dow];

    const next: DaySchedule[] = draft.weekly.map((d, i) => ({
      closed: d.closed,
      sessions: d.sessions.filter((_, idx) => !(form.index !== null && form.dow === i && form.index === idx)),
    }));
    for (const dow of days) {
      next[dow].closed = false;
      next[dow].sessions.push({ start: formStart, end: formEnd, location: effectiveFormLocation });
    }

    // Same checks as saving: valid times, no overlap, long enough for one appointment
    const check = normalizeClinicSettings({
      slotDuration: Number(draft.slotDuration),
      bufferTime: Number(draft.bufferTime),
      weekly: next.map((d) => ({ closed: d.sessions.length === 0, sessions: d.sessions })),
      locations: draft.locations,
    });
    if (!check.settings) {
      setFormError(check.error || 'Please check the time.');
      return;
    }
    update({ weekly: check.settings.weekly.map((d) => ({ ...d })) });
    closeForm();
  };

  const handleRemoveTiming = (dow: number, index: number) => {
    const sessions = draft.weekly[dow].sessions.filter((_, i) => i !== index);
    update({
      weekly: draft.weekly.map((d, i) => (i === dow ? { closed: sessions.length === 0, sessions } : d)),
    });
    if (form) closeForm();
  };

  // ------------------------------------------------------------ validation/save
  const validation = useMemo(
    () =>
      normalizeClinicSettings({
        slotDuration: draft.slotDuration === '' ? NaN : Number(draft.slotDuration),
        bufferTime: draft.bufferTime === '' ? NaN : Number(draft.bufferTime),
        weekly: draft.weekly,
        locations: draft.locations,
      }),
    [draft]
  );

  const isDirty = useMemo(
    () => JSON.stringify(toDraft(settings)) !== JSON.stringify(draft),
    [settings, draft]
  );

  const handleUndo = () => {
    touched.current = false;
    setWarning(null);
    closeForm();
    setRenaming(null);
    setLocationError('');
    setDraft(toDraft(settings));
  };

  const handleSave = async () => {
    if (!validation.settings) {
      toast.warning(validation.error || 'Please check the timings.', 'Cannot Save Yet');
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

      toast.success('Your clinic timings are saved. Patients will see them now.', 'Saved');

      if (typeof data.offGridCount === 'number' && data.offGridCount > 0) {
        setWarning(
          `${data.offGridCount} upcoming appointment${
            data.offGridCount === 1 ? ' is' : 's are'
          } outside the new timings. They are still valid, but you may want to reschedule ${
            data.offGridCount === 1 ? 'it' : 'them'
          }.`
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

  const showLocationOnChips = draft.locations.length > 1;

  return (
    <div className="availability-card slot-settings-card">
      <style>{`
        .slot-settings-card { margin-bottom: 24px; }
        .ss-step { margin-top: 26px; }
        .ss-step:first-of-type { margin-top: 18px; }
        .ss-step-title { display: flex; align-items: center; gap: 10px; font-family: var(--serif); font-size: 16px; font-weight: 800; color: var(--primary-dark, #1F2278); margin: 0 0 4px; }
        .ss-step-num { width: 26px; height: 26px; border-radius: 50%; background: var(--primary, #565ACF); color: #fff; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; }
        .ss-step-help { font-size: 13.5px; color: #64748b; margin: 0 0 12px 36px; }

        .ss-chip-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 12px 36px; }
        .ss-place { display: inline-flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; border-radius: 999px; background: var(--primary-light, #EEF0FF); color: var(--primary-dark, #1F2278); font-weight: 700; font-size: 14px; }
        .ss-icon-btn { border: none; background: rgba(255,255,255,0.8); color: #475569; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .ss-icon-btn:hover { background: #fff; }
        .ss-icon-btn.danger { color: #b91c1c; }
        .ss-add-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-left: 36px; }
        .ss-add-row .admin-input { flex: 1 1 220px; max-width: 340px; }
        .ss-add-row .btn-save-override { padding: 10px 22px; }
        .ss-rename { display: inline-flex; align-items: center; gap: 6px; }
        .ss-rename .admin-input { max-width: 200px; padding: 6px 10px; }

        .ss-days { margin-left: 36px; border: 1.5px solid var(--line, #e2e8f0); border-radius: 14px; overflow: hidden; background: #fff; }
        .ss-day { display: flex; gap: 16px; align-items: flex-start; padding: 12px 16px; border-bottom: 1px solid var(--line, #e2e8f0); }
        .ss-day:last-child { border-bottom: none; }
        .ss-day-name { width: 96px; flex: none; font-weight: 800; font-size: 14px; color: var(--primary-dark, #1F2278); padding-top: 7px; }
        .ss-day-body { flex: 1; min-width: 0; }
        .ss-day-items { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .ss-closed { font-size: 13.5px; color: #94a3b8; }
        .ss-time { display: inline-flex; align-items: center; border-radius: 10px; background: #f1f5ff; border: 1.5px solid #dbe2ff; overflow: hidden; }
        .ss-time button { border: none; background: transparent; cursor: pointer; font-size: 13.5px; }
        .ss-time-main { padding: 7px 12px; font-weight: 700; color: var(--primary-dark, #1F2278); text-align: left; }
        .ss-time-main small { display: block; font-weight: 600; font-size: 11.5px; color: #64748b; }
        .ss-time-x { padding: 7px 11px; color: #b91c1c; font-weight: 800; border-left: 1.5px solid #dbe2ff !important; }
        .ss-time-x:hover { background: #fee2e2; }
        .ss-add-time { border: 1.5px dashed var(--primary, #565ACF); background: transparent; color: var(--primary, #565ACF); border-radius: 10px; padding: 7px 12px; cursor: pointer; font-weight: 700; font-size: 13px; }

        .ss-form { margin-top: 12px; padding: 14px; border-radius: 12px; background: #f8f9ff; border: 1.5px solid #dde1f8; }
        .ss-form-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
        .ss-field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 700; color: #475569; }
        .ss-field .admin-input { max-width: 150px; }
        .ss-field .admin-input.wide { max-width: 220px; }
        .ss-repeat { margin-top: 12px; font-size: 12.5px; font-weight: 700; color: #475569; }
        .ss-repeat-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .ss-chip { padding: 5px 12px; border-radius: 999px; border: 1.5px solid var(--line, #e2e8f0); background: #fff; cursor: pointer; font-size: 12.5px; font-weight: 700; }
        .ss-chip.active { background: var(--primary, #565ACF); border-color: var(--primary, #565ACF); color: #fff; }
        .ss-form-actions { display: flex; gap: 8px; margin-top: 14px; }
        .ss-form-actions .btn-save-override { padding: 9px 20px; }
        .ss-ghost { padding: 9px 18px; border-radius: 10px; border: 1.5px solid var(--line, #e2e8f0); background: #fff; cursor: pointer; font-weight: 700; font-size: 13.5px; }

        .ss-length-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-left: 36px; font-size: 14px; color: var(--ink, #44476A); }
        .ss-length-row .admin-input { width: auto; min-width: 130px; }

        .ss-error { color: #b91c1c; font-size: 13px; margin: 10px 0 0 36px; font-weight: 600; }
        .ss-form .ss-error { margin-left: 0; }
        .ss-warning { margin-top: 16px; padding: 10px 14px; border-radius: 10px; background: #fef3c7; color: #92400e; font-size: 13px; }
        .ss-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line, #e2e8f0); }
        .ss-footer .btn-save-override { padding: 12px 28px; }
        .ss-unsaved { font-size: 13px; font-weight: 700; color: #b45309; }
        @media (max-width: 720px) {
          .ss-step-help, .ss-chip-row, .ss-add-row, .ss-days, .ss-length-row { margin-left: 0; }
          .ss-day { flex-direction: column; gap: 6px; }
          .ss-day-name { width: auto; padding-top: 0; }
        }
      `}</style>

      <h3 className="card-heading">Clinic Timings</h3>
      <p className="card-subhead">
        Tell patients where you sit and when. Patients can only book the days and times you set here.
      </p>

      {/* 1. PLACES */}
      <div className="ss-step">
        <h4 className="ss-step-title">
          <span className="ss-step-num">1</span> Where do you sit?
        </h4>
        <p className="ss-step-help">Add each clinic or hospital where you see patients.</p>

        {draft.locations.length > 0 && (
          <div className="ss-chip-row">
            {draft.locations.map((loc, index) => {
              const renamingHere = renaming && renaming.index === index ? renaming : null;
              return renamingHere ? (
                <span key={loc} className="ss-rename">
                  <input
                    type="text"
                    className="admin-input"
                    maxLength={MAX_LOCATION_LENGTH}
                    value={renamingHere.value}
                    autoFocus
                    onChange={(e) => setRenaming({ index, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveRename();
                      }
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    aria-label={`New name for ${loc}`}
                  />
                  <button type="button" className="ss-ghost" onClick={handleSaveRename}>
                    Save
                  </button>
                  <button type="button" className="ss-ghost" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <span key={loc} className="ss-place">
                  {loc}
                  <button
                    type="button"
                    className="ss-icon-btn"
                    onClick={() => {
                      setLocationError('');
                      setRenaming({ index, value: loc });
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="ss-icon-btn danger"
                    onClick={() => handleRemoveLocation(index)}
                    aria-label={`Remove ${loc}`}
                  >
                    Remove
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="ss-add-row">
          <input
            type="text"
            className="admin-input"
            placeholder="Type a place name, e.g. Akurdi Clinic"
            maxLength={MAX_LOCATION_LENGTH}
            value={newLocation}
            onChange={(e) => {
              setLocationError('');
              setNewLocation(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddLocation();
              }
            }}
            aria-label="New place name"
          />
          <button type="button" className="btn btn-save-override" onClick={handleAddLocation}>
            Add place
          </button>
        </div>
        {locationError && <div className="ss-error">{locationError}</div>}
      </div>

      {/* 2. WEEKLY TIMINGS */}
      <div className="ss-step">
        <h4 className="ss-step-title">
          <span className="ss-step-num">2</span> When do you sit there?
        </h4>
        <p className="ss-step-help">
          Press &quot;+ Add time&quot; on a day. Days with no time are shown as closed.
        </p>

        {draft.locations.length === 0 ? (
          <p className="ss-error" style={{ marginTop: 0 }}>
            Add a place above first.
          </p>
        ) : (
          <div className="ss-days">
            {WEEKDAY_DISPLAY_ORDER.map((dow) => {
              const sessions = draft.weekly[dow].sessions;
              const formHere = form && form.dow === dow ? form : null;
              return (
                <div className="ss-day" key={dow}>
                  <div className="ss-day-name">{WEEKDAY_NAMES[dow]}</div>
                  <div className="ss-day-body">
                    <div className="ss-day-items">
                      {sessions.length === 0 && !formHere && <span className="ss-closed">Closed</span>}
                      {sessions.map((session, index) => (
                        <span className="ss-time" key={`${session.start}-${session.end}-${index}`}>
                          <button
                            type="button"
                            className="ss-time-main"
                            onClick={() => openEdit(dow, index)}
                            title="Click to change this time"
                          >
                            {formatSlotLabel(session.start)} - {formatSlotLabel(session.end)}
                            {showLocationOnChips && <small>{session.location}</small>}
                          </button>
                          <button
                            type="button"
                            className="ss-time-x"
                            onClick={() => handleRemoveTiming(dow, index)}
                            aria-label={`Remove ${formatSlotLabel(session.start)} to ${formatSlotLabel(
                              session.end
                            )} on ${WEEKDAY_NAMES[dow]}`}
                            title="Remove this time"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      {!formHere && (
                        <button type="button" className="ss-add-time" onClick={() => openAdd(dow)}>
                          + Add time
                        </button>
                      )}
                    </div>

                    {formHere && (
                      <div className="ss-form">
                        <div className="ss-form-row">
                          <label className="ss-field">
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
                          </label>
                          <label className="ss-field">
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
                          </label>
                          {draft.locations.length > 1 && (
                            <label className="ss-field">
                              <span>At</span>
                              <select
                                className="admin-input wide"
                                value={effectiveFormLocation}
                                onChange={(e) => {
                                  setFormError('');
                                  setFormLocation(e.target.value);
                                }}
                              >
                                {draft.locations.map((loc) => (
                                  <option key={loc} value={loc}>
                                    {loc}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>

                        {formHere.index === null && (
                          <div className="ss-repeat">
                            Also add the same time on:
                            <div className="ss-repeat-chips">
                              {WEEKDAY_DISPLAY_ORDER.filter((d) => d !== dow).map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  className={`ss-chip ${formRepeat.includes(d) ? 'active' : ''}`}
                                  onClick={() => {
                                    setFormError('');
                                    setFormRepeat((prev) =>
                                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                                    );
                                  }}
                                >
                                  {WEEKDAY_NAMES[d].slice(0, 3)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {formError && <div className="ss-error">{formError}</div>}

                        <div className="ss-form-actions">
                          <button type="button" className="btn btn-save-override" onClick={handleSaveTiming}>
                            {formHere.index === null ? 'Add time' : 'Update time'}
                          </button>
                          <button type="button" className="ss-ghost" onClick={closeForm}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!validation.settings && !form && <div className="ss-error">{validation.error}</div>}
      </div>

      {/* 3. APPOINTMENT LENGTH */}
      <div className="ss-step">
        <h4 className="ss-step-title">
          <span className="ss-step-num">3</span> How long is each appointment?
        </h4>
        <div className="ss-length-row" style={{ marginTop: 10 }}>
          <span>Each patient gets</span>
          <select
            className="admin-input"
            value={draft.slotDuration}
            onChange={(e) => update({ slotDuration: e.target.value })}
            aria-label="Appointment length"
          >
            {withCurrent(DURATION_OPTIONS, draft.slotDuration).map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
          <span>with a gap of</span>
          <select
            className="admin-input"
            value={draft.bufferTime}
            onChange={(e) => update({ bufferTime: e.target.value })}
            aria-label="Gap between appointments"
          >
            {withCurrent(BUFFER_OPTIONS, draft.bufferTime).map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'no gap' : `${m} minutes`}
              </option>
            ))}
          </select>
          <span>between patients.</span>
        </div>
      </div>

      {warning && <div className="ss-warning">{warning}</div>}

      <div className="ss-footer">
        <button
          type="button"
          className="btn btn-save-override"
          disabled={isSaving || !isDirty || !validation.settings}
          onClick={handleSave}
        >
          {isSaving ? 'Saving...' : 'Save changes'}
        </button>
        {isDirty && (
          <button type="button" className="ss-ghost" disabled={isSaving} onClick={handleUndo}>
            Undo changes
          </button>
        )}
        {isDirty && <span className="ss-unsaved">You have changes that are not saved yet.</span>}
      </div>
    </div>
  );
}