'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { setClinicSettingsCache, useClinicSettings } from '@/lib/useClinicSettings';
import {
  ClinicSettings,
  MAX_BUFFER,
  MAX_DURATION,
  MAX_SESSIONS,
  MIN_DURATION,
  SessionWindow,
  generateSlots,
  normalizeClinicSettings,
} from '@/lib/slots';

const DURATION_PRESETS = [10, 15, 20, 30, 45, 60];
const BUFFER_PRESETS = [0, 5, 10, 15, 20, 30];

interface Draft {
  slotDuration: string;
  bufferTime: string;
  sessions: SessionWindow[];
}

function toDraft(settings: ClinicSettings): Draft {
  return {
    slotDuration: String(settings.slotDuration),
    bufferTime: String(settings.bufferTime),
    sessions: settings.sessions.map((s) => ({ ...s })),
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

  const updateSession = (index: number, patch: Partial<SessionWindow>) => {
    update({
      sessions: draft.sessions.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  };

  const addSession = () => {
    if (draft.sessions.length >= MAX_SESSIONS) return;
    const last = draft.sessions[draft.sessions.length - 1];
    update({
      sessions: [...draft.sessions, { start: last?.end || '09:00', end: last?.end ? '20:00' : '13:00' }],
    });
  };

  const removeSession = (index: number) => {
    update({ sessions: draft.sessions.filter((_, i) => i !== index) });
  };

  const validation = useMemo(
    () =>
      normalizeClinicSettings({
        slotDuration: draft.slotDuration === '' ? NaN : Number(draft.slotDuration),
        bufferTime: draft.bufferTime === '' ? NaN : Number(draft.bufferTime),
        sessions: draft.sessions,
      }),
    [draft]
  );

  const previewSlots = useMemo(
    () => (validation.settings ? generateSlots(validation.settings) : []),
    [validation.settings]
  );

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
        `Appointments are now ${data.settings.slotDuration} min with ${data.settings.bufferTime} min buffer (${data.slots.length} slots/day).`,
        'Settings Saved'
      );

      if (typeof data.offGridCount === 'number' && data.offGridCount > 0) {
        setWarning(
          `${data.offGridCount} upcoming appointment${
            data.offGridCount === 1 ? '' : 's'
          } were booked at times that are not on the new slot grid. They stay valid and still block overlapping slots, but you may want to reschedule them.`
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
        @media (max-width: 720px) { .slot-settings-grid { grid-template-columns: 1fr; } }
      `}</style>

      <h3 className="card-heading">Appointment Duration &amp; Buffer</h3>
      <p className="card-subhead">
        Choose how long each appointment lasts and the gap kept between two appointments. Slots on
        the booking page, admin calendar and reschedule window update automatically.
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
          Working sessions (e.g. morning &amp; evening)
        </label>
        {draft.sessions.map((session, index) => (
          <div className="slot-settings-session-row" key={index}>
            <input
              type="time"
              className="admin-input"
              value={session.start}
              onChange={(e) => updateSession(index, { start: e.target.value })}
              aria-label={`Session ${index + 1} start`}
            />
            <span>to</span>
            <input
              type="time"
              className="admin-input"
              value={session.end}
              onChange={(e) => updateSession(index, { end: e.target.value })}
              aria-label={`Session ${index + 1} end`}
            />
            <button
              type="button"
              className="slot-settings-remove"
              disabled={draft.sessions.length <= 1}
              onClick={() => removeSession(index)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="slot-settings-add"
          disabled={draft.sessions.length >= MAX_SESSIONS}
          onClick={addSession}
        >
          + Add session
        </button>
      </div>

      <div className="slot-settings-preview">
        <strong style={{ fontSize: 13 }}>
          Preview: {previewSlots.length} slot{previewSlots.length === 1 ? '' : 's'} per day
          {validation.settings
            ? ` (${validation.settings.slotDuration} min + ${validation.settings.bufferTime} min buffer)`
            : ''}
        </strong>
        {validation.settings ? (
          <div className="slot-settings-preview-chips">
            {previewSlots.map((slot) => (
              <span className="slot-settings-preview-chip" key={slot.value}>
                {slot.label}
              </span>
            ))}
          </div>
        ) : (
          <div className="slot-settings-error">{validation.error}</div>
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
