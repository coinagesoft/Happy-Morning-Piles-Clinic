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

/** One colour per place, so timings are easy to tell apart at a glance. */
const LOC_COLORS = ['#565ACF', '#0f9d76', '#e07a1f', '#c2417a', '#0e88b8', '#7c4dbb'];

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

  // ------------------------------------------------------------- presentation
  const locColor = (loc: string) => {
    const i = draft.locations.findIndex((l) => sameLocation(l, loc));
    return LOC_COLORS[(i < 0 ? 0 : i) % LOC_COLORS.length];
  };

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const stats = useMemo(() => {
    let openDays = 0;
    let sessionCount = 0;
    let minutes = 0;
    draft.weekly.forEach((d) => {
      if (d.sessions.length > 0) openDays += 1;
      d.sessions.forEach((s) => {
        sessionCount += 1;
        minutes += Math.max(0, toMinutes(s.end) - toMinutes(s.start));
      });
    });
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { openDays, sessionCount, hours: m ? `${h}h ${m}m` : `${h}h` };
  }, [draft.weekly]);

  return (
    <div className="availability-card slot-settings-card">
      <style>{`
        .slot-settings-card { margin-bottom: 24px; padding: 28px 30px 24px; }
        .ss-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
        .ss-head .card-heading { margin-bottom: 4px; }
        .ss-head .card-subhead { margin: 0; }
        .ss-unsaved { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #b45309; background: #fff7e6; border: 1px solid #fde1a8; padding: 7px 14px; border-radius: 999px; }
        .ss-unsaved::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }

        .ss-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }

        .ss-panel { border: 1.5px solid var(--line, #e2e8f0); border-radius: 16px; background: #fff; overflow: hidden; }
        .ss-panel + .ss-panel { margin-top: 18px; }
        .ss-panel-head { padding: 16px 20px; border-bottom: 1px solid var(--line, #e2e8f0); background: linear-gradient(180deg, #fafbff 0%, #f5f6ff 100%); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        .ss-panel-title { display: flex; align-items: center; gap: 10px; font-family: var(--serif); font-size: 16px; font-weight: 800; color: var(--primary-dark, #1F2278); margin: 0; }
        .ss-panel-title svg { color: var(--primary, #565ACF); flex: none; }
        .ss-panel-sub { font-size: 13px; color: #64748b; margin: 4px 0 0; }
        .ss-panel-body { padding: 16px 20px 20px; }

        .ss-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; }
        .ss-legend-item { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: #475569; }
        .ss-dot { width: 7px; height: 7px; min-width: 7px; border-radius: 50%; background: var(--loc, #565ACF); flex: none; display: inline-block; }

        .ss-day { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 18px; padding: 16px 20px; border-bottom: 1px solid var(--line, #e2e8f0); align-items: start; }
        .ss-day:last-child { border-bottom: none; }
        .ss-day.is-closed { background: #fcfcfe; }
        .ss-day-name { font-weight: 800; font-size: 15px; color: var(--primary-dark, #1F2278); }
        .ss-day-status { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.02em; }
        .ss-day-status.open { background: #e7f8ef; color: #0f7a4c; }
        .ss-day-status.closed { background: #f1f5f9; color: #64748b; }
        .ss-day-body { min-width: 0; }
        .ss-day-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }

        .ss-time { display: flex; align-items: stretch; border-radius: 12px; background: color-mix(in srgb, var(--loc, #565ACF) 8%, #fff); border: 1.5px solid color-mix(in srgb, var(--loc, #565ACF) 25%, #fff); overflow: hidden; transition: box-shadow .15s, transform .15s; }
        .ss-time:hover { box-shadow: 0 4px 14px rgba(31, 34, 120, 0.10); transform: translateY(-1px); }
        .ss-time button { border: none; background: transparent; cursor: pointer; font-size: 13.5px; font-family: inherit; }
        .ss-time-main { flex: 1; min-width: 0; padding: 10px 12px; font-weight: 800; color: var(--primary-dark, #1F2278); text-align: left; line-height: 1.25; }
        .ss-time-main small { display: flex; align-items: center; gap: 7px; margin-top: 5px; font-weight: 600; font-size: 12px; color: #64748b; }
        .ss-time-x { flex: none; width: 36px; color: #b91c1c; font-size: 18px; font-weight: 700; border-left: 1px solid color-mix(in srgb, var(--loc, #565ACF) 20%, #fff) !important; }
        .ss-time-x:hover { background: #fee2e2; }
        .ss-add-time { min-height: 56px; border: 1.5px dashed #b6bbf0; background: #fafbff; color: var(--primary, #565ACF); border-radius: 12px; padding: 8px 12px; cursor: pointer; font-weight: 800; font-size: 13.5px; font-family: inherit; transition: background .15s, border-color .15s; }
        .ss-add-time:hover { background: #eef0ff; border-color: var(--primary, #565ACF); }
        .ss-closed { display: flex; align-items: center; font-size: 13.5px; color: #94a3b8; min-height: 56px; }

        .ss-form { margin-top: 14px; padding: 16px; border-radius: 14px; background: #f8f9ff; border: 1.5px solid #dde1f8; }
        .ss-form-title { font-size: 13px; font-weight: 800; color: var(--primary-dark, #1F2278); margin: 0 0 12px; }
        .ss-form-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
        .ss-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 700; color: #475569; }
        .ss-field .admin-input { max-width: 150px; }
        .ss-field .admin-input.wide { max-width: 230px; }
        .ss-repeat { margin-top: 14px; font-size: 12.5px; font-weight: 700; color: #475569; }
        .ss-repeat-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .ss-chip { padding: 5px 13px; border-radius: 999px; border: 1.5px solid var(--line, #e2e8f0); background: #fff; cursor: pointer; font-size: 12.5px; font-weight: 700; font-family: inherit; }
        .ss-chip.active { background: var(--primary, #565ACF); border-color: var(--primary, #565ACF); color: #fff; }
        .ss-form-actions { display: flex; gap: 8px; margin-top: 16px; }
        .ss-form-actions .btn-save-override { padding: 9px 20px; }
        .ss-ghost { padding: 9px 18px; border-radius: 10px; border: 1.5px solid var(--line, #e2e8f0); background: #fff; cursor: pointer; font-weight: 700; font-size: 13.5px; font-family: inherit; }
        .ss-ghost:hover { background: #f8fafc; }

        .ss-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .ss-stat { padding: 14px 6px; border-radius: 14px; text-align: center; background: linear-gradient(180deg, #f5f6ff, #eef0ff); border: 1.5px solid #dde1f8; }
        .ss-stat strong { display: block; font-family: var(--serif); font-size: 19px; line-height: 1.2; white-space: nowrap; color: var(--primary-dark, #1F2278); }
        .ss-stat span { display: block; margin-top: 5px; font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }

        .ss-place-list { display: flex; flex-direction: column; gap: 10px; }
        .ss-place { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px; border-radius: 12px; border: 1.5px solid var(--line, #e2e8f0); background: #fff; }
        .ss-place-info { flex: 1; min-width: 0; }
        .ss-place-name { display: block; font-weight: 800; font-size: 14px; color: var(--primary-dark, #1F2278); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ss-place-meta { display: block; font-size: 12px; color: #64748b; margin-top: 2px; }
        .ss-icon-btn { flex: none; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: none; background: #f1f5f9; color: #475569; border-radius: 8px; cursor: pointer; }
        .ss-place-actions { display: flex; gap: 6px; flex: none; }
        .ss-icon-btn:hover { background: #e2e8f0; }
        .ss-icon-btn.danger { color: #b91c1c; background: #fef2f2; }
        .ss-icon-btn.danger:hover { background: #fee2e2; }
        .ss-rename { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; border: 1.5px solid #dde1f8; background: #f8f9ff; }
        .ss-rename .admin-input { flex: 1 1 100%; padding: 8px 10px; }
        .ss-rename .ss-ghost { padding: 6px 14px; font-size: 12.5px; }
        .ss-add-row { display: flex; gap: 8px; margin-top: 14px; }
        .ss-add-row .admin-input { flex: 1; min-width: 0; }
        .ss-add-row .btn-save-override { padding: 10px 18px; white-space: nowrap; }

        .ss-length-grid { display: flex; flex-direction: column; gap: 14px; }
        .ss-length-grid .ss-field { font-size: 13px; }
        .ss-length-grid .admin-input { max-width: none; width: 100%; }
        .ss-length-note { margin: 14px 0 0; font-size: 12.5px; color: #64748b; line-height: 1.5; }

        .ss-error { color: #b91c1c; font-size: 13px; margin: 10px 0 0; font-weight: 600; }
        .ss-warning { margin-top: 18px; padding: 12px 16px; border-radius: 12px; background: #fef3c7; color: #92400e; font-size: 13px; }
        .ss-footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line, #e2e8f0); }
        .ss-footer .ss-unsaved { margin-right: auto; }
        .ss-footer .btn-save-override { padding: 12px 30px; }

        @media (max-width: 1100px) {
          .ss-layout { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 720px) {
          .slot-settings-card { padding: 20px 16px; }
          .ss-day { grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 14px 14px; }
          .ss-day-head { display: flex; align-items: center; gap: 10px; }
          .ss-day-status { margin-top: 0; }
          .ss-day-items { grid-template-columns: minmax(0, 1fr); }
          .ss-stats { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      <div className="ss-head">
        <div>
          <h3 className="card-heading">Clinic Timings</h3>
          <p className="card-subhead">
            Tell patients where you sit and when. Patients can only book the days and times you set here.
          </p>
        </div>
        {isDirty && <span className="ss-unsaved">Unsaved changes</span>}
      </div>

      <div className="ss-layout">
        {/* ============ LEFT: WEEKLY SCHEDULE ============ */}
        <section className="ss-panel">
          <div className="ss-panel-head">
            <div>
              <h4 className="ss-panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Weekly Schedule
              </h4>
              <p className="ss-panel-sub">
                Press &quot;+ Add time&quot; on a day. Days with no time are shown as closed.
              </p>
            </div>
            {showLocationOnChips && (
              <div className="ss-legend">
                {draft.locations.map((loc) => (
                  <span
                    key={loc}
                    className="ss-legend-item"
                    style={{ ['--loc' as string]: locColor(loc) } as React.CSSProperties}
                  >
                    <span className="ss-dot" /> {loc}
                  </span>
                ))}
              </div>
            )}
          </div>

          {draft.locations.length === 0 ? (
            <div className="ss-panel-body">
              <p className="ss-error" style={{ marginTop: 0 }}>
                Add a place on the right first.
              </p>
            </div>
          ) : (
            <div>
              {WEEKDAY_DISPLAY_ORDER.map((dow) => {
                const sessions = draft.weekly[dow].sessions;
                const formHere = form && form.dow === dow ? form : null;
                return (
                  <div className={`ss-day ${sessions.length === 0 ? 'is-closed' : ''}`} key={dow}>
                    <div className="ss-day-head">
                      <div className="ss-day-name">{WEEKDAY_NAMES[dow]}</div>
                      <span className={`ss-day-status ${sessions.length === 0 ? 'closed' : 'open'}`}>
                        {sessions.length === 0
                          ? 'Closed'
                          : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <div className="ss-day-body">
                      <div className="ss-day-items">
                        {sessions.length === 0 && !formHere && (
                          <span className="ss-closed">No consultations on this day</span>
                        )}
                        {sessions.map((session, index) => (
                          <span
                            className="ss-time"
                            key={`${session.start}-${session.end}-${index}`}
                            style={{ ['--loc' as string]: locColor(session.location || DEFAULT_LOCATION) } as React.CSSProperties}
                          >
                            <button
                              type="button"
                              className="ss-time-main"
                              onClick={() => openEdit(dow, index)}
                              title="Click to change this time"
                            >
                              {formatSlotLabel(session.start)} - {formatSlotLabel(session.end)}
                              {showLocationOnChips && (
                                <small>
                                  <span className="ss-dot" />
                                  {session.location}
                                </small>
                              )}
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
                          <p className="ss-form-title">
                            {formHere.index === null ? 'Add a time' : 'Change this time'} &middot;{' '}
                            {WEEKDAY_NAMES[dow]}
                          </p>
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
          {!validation.settings && !form && (
            <div className="ss-panel-body" style={{ paddingTop: 0 }}>
              <div className="ss-error">{validation.error}</div>
            </div>
          )}
        </section>

        {/* ============ RIGHT: SUMMARY, PLACES, LENGTH ============ */}
        <aside>
          <div className="ss-panel">
            <div className="ss-panel-body">
              <div className="ss-stats">
                <div className="ss-stat">
                  <strong>{stats.openDays}</strong>
                  <span>Open days</span>
                </div>
                <div className="ss-stat">
                  <strong>{stats.sessionCount}</strong>
                  <span>Sessions</span>
                </div>
                <div className="ss-stat">
                  <strong>{stats.hours}</strong>
                  <span>Per week</span>
                </div>
              </div>
            </div>
          </div>

          {/* PLACES */}
          <div className="ss-panel">
            <div className="ss-panel-head">
              <div>
                <h4 className="ss-panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Where do you sit?
                </h4>
                <p className="ss-panel-sub">Add each clinic or hospital where you see patients.</p>
              </div>
            </div>
            <div className="ss-panel-body">
              {draft.locations.length > 0 && (
                <div className="ss-place-list">
                  {draft.locations.map((loc, index) => {
                    const renamingHere = renaming && renaming.index === index ? renaming : null;
                    const count = timingsAtLocation(loc);
                    return renamingHere ? (
                      <div key={loc} className="ss-rename">
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
                      </div>
                    ) : (
                      <div
                        key={loc}
                        className="ss-place"
                        style={{ ['--loc' as string]: locColor(loc) } as React.CSSProperties}
                      >
                        <span className="ss-dot" />
                        <span className="ss-place-info">
                          <span className="ss-place-name" title={loc}>
                            {loc}
                          </span>
                          <span className="ss-place-meta">
                            {count} timing{count === 1 ? '' : 's'} / week
                          </span>
                        </span>
                        <span className="ss-place-actions">
                          <button
                            type="button"
                            className="ss-icon-btn"
                            title="Rename"
                            aria-label={`Rename ${loc}`}
                            onClick={() => {
                              setLocationError('');
                              setRenaming({ index, value: loc });
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="ss-icon-btn danger"
                            title="Remove"
                            aria-label={`Remove ${loc}`}
                            onClick={() => handleRemoveLocation(index)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="ss-add-row">
                <input
                  type="text"
                  className="admin-input"
                  placeholder="e.g. Akurdi Clinic"
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
          </div>

          {/* APPOINTMENT LENGTH */}
          <div className="ss-panel">
            <div className="ss-panel-head">
              <div>
                <h4 className="ss-panel-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  How long is each appointment?
                </h4>
              </div>
            </div>
            <div className="ss-panel-body">
              <div className="ss-length-grid">
                <label className="ss-field">
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
                </label>
                <label className="ss-field">
                  <span>Gap between patients</span>
                  <select
                    className="admin-input"
                    value={draft.bufferTime}
                    onChange={(e) => update({ bufferTime: e.target.value })}
                    aria-label="Gap between appointments"
                  >
                    {withCurrent(BUFFER_OPTIONS, draft.bufferTime).map((m) => (
                      <option key={m} value={m}>
                        {m === 0 ? 'No gap' : `${m} minutes`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="ss-length-note">
                Each patient gets {draft.slotDuration || '–'} minutes
                {Number(draft.bufferTime) > 0 ? `, with a ${draft.bufferTime}-minute gap after` : ', with no gap between patients'}.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {warning && <div className="ss-warning">{warning}</div>}

      <div className="ss-footer">
        {isDirty && <span className="ss-unsaved">You have changes that are not saved yet.</span>}
        {isDirty && (
          <button type="button" className="ss-ghost" disabled={isSaving} onClick={handleUndo}>
            Undo changes
          </button>
        )}
        <button
          type="button"
          className="btn btn-save-override"
          disabled={isSaving || !isDirty || !validation.settings}
          onClick={handleSave}
        >
          {isSaving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}