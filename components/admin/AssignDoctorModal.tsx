'use client';

import React, { useEffect, useState } from 'react';
import type { Appointment } from '@/lib/storage';
import { toast } from '@/components/ui/Toast';

interface AssignableDoctor {
  id: string;
  name: string;
  specialization: string;
  locations: string[];
  available: boolean;
  reason?: string;
}

interface AssignDoctorModalProps {
  appointment: Appointment | null;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onAssigned: (appointment: Appointment) => void;
}

/** Receptionist / Super Admin: pick an available doctor for a registered patient. */
export default function AssignDoctorModal({
  appointment,
  adminFetch,
  onClose,
  onAssigned,
}: AssignDoctorModalProps) {
  const [doctors, setDoctors] = useState<AssignableDoctor[]>([]);
  const [assignedId, setAssignedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const appointmentId = appointment?.id;

  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    setSelectedId('');
    adminFetch(`/api/admin/appointments/assign?appointmentId=${encodeURIComponent(appointmentId)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load doctors.');
        if (cancelled) return;
        setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
        setAssignedId(data.assignedDoctorId || null);
        setSelectedId(data.assignedDoctorId || '');
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load doctors.'))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [appointmentId, adminFetch]);

  if (!appointment) return null;

  const save = async (doctorId: string | null) => {
    setIsSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/appointments/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.id, doctorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not assign doctor.');
        return;
      }
      toast.success(data.message || 'Doctor updated.', doctorId ? 'Doctor Assigned' : 'Doctor Removed');
      onAssigned(data.appointment);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = Boolean(selectedId) && selectedId !== assignedId;

  return (
    <div className="adm-overlay" onClick={() => !isSaving && onClose()} role="dialog" aria-modal="true">
      <style>{STYLES}</style>
      <div className="adm-card" onClick={(e) => e.stopPropagation()}>
        <div className="adm-head">
          <div>
            <h3>Assign Doctor</h3>
            <p>
              {appointment.fullName} · {appointment.date} · {appointment.time}
              {appointment.location ? ` · 📍 ${appointment.location}` : ''}
            </p>
          </div>
          <button type="button" className="adm-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="adm-body">
          {error && (
            <div className="admin-alert alert-error" role="alert">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="adm-note">Checking doctor availability…</div>
          ) : doctors.length === 0 && !error ? (
            <div className="adm-note">
              No active doctors yet. The Super Admin can add doctors in the Doctors tab.
            </div>
          ) : (
            <div className="adm-list">
              {doctors.map((d) => (
                <label
                  key={d.id}
                  className={`adm-row ${selectedId === d.id ? 'sel' : ''} ${d.available ? '' : 'off'}`}
                >
                  <input
                    type="radio"
                    name="doctor"
                    disabled={!d.available}
                    checked={selectedId === d.id}
                    onChange={() => setSelectedId(d.id)}
                  />
                  <div className="adm-info">
                    <strong>{d.name}</strong>
                    <span>
                      {[d.specialization, d.locations.join(', ')].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </div>
                  {d.available ? (
                    <span className="adm-tag ok">{assignedId === d.id ? 'Assigned' : 'Available'}</span>
                  ) : (
                    <span className="adm-tag no">{d.reason || 'Unavailable'}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="adm-foot">
          {assignedId && (
            <button
              type="button"
              className="adm-btn danger"
              disabled={isSaving}
              onClick={() => save(null)}
            >
              Remove doctor
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="adm-btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-admin-primary"
            disabled={!canSave || isSaving}
            onClick={() => save(selectedId)}
          >
            {isSaving ? 'Saving…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STYLES = `
.adm-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px}
.adm-card{background:#fff;border-radius:14px;width:min(520px,100%);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(15,23,42,.3)}
.adm-head{display:flex;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid #e2e8f0}
.adm-head h3{margin:0;font-size:18px;color:#0f172a}
.adm-head p{margin:4px 0 0;color:#64748b;font-size:13px}
.adm-x{border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#64748b}
.adm-body{padding:16px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.adm-note{color:#64748b;font-size:13.5px;padding:10px 0}
.adm-list{display:flex;flex-direction:column;gap:8px}
.adm-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer}
.adm-row.sel{border-color:#4338ca;background:#eef2ff}
.adm-row.off{opacity:.6;cursor:not-allowed}
.adm-info{display:flex;flex-direction:column;flex:1;min-width:0}
.adm-info strong{color:#0f172a;font-size:14px}
.adm-info span{color:#64748b;font-size:12.5px}
.adm-tag{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
.adm-tag.ok{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
.adm-tag.no{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;white-space:normal;text-align:right;max-width:170px}
.adm-foot{display:flex;align-items:center;gap:8px;padding:14px 22px;border-top:1px solid #e2e8f0}
.adm-btn{padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;font-size:13px;font-weight:600;cursor:pointer}
.adm-btn.danger{color:#b91c1c;border-color:#fecaca}
.adm-btn:disabled{opacity:.55;cursor:not-allowed}
`;
