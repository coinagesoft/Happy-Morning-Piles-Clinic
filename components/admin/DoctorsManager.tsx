'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Doctor } from '@/lib/doctors';
import { toast } from '@/components/ui/Toast';
import { useClinicSettings } from '@/lib/useClinicSettings';

interface DoctorsManagerProps {
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** The signed-in Super Admin (used to offer "add me as a doctor"). */
  currentUser?: { email: string; name: string } | null;
}

interface DoctorFormState {
  id: string | null;
  /** true = the Super Admin listing their own account (no email / password needed) */
  isSelf: boolean;
  name: string;
  email: string;
  password: string;
  phone: string;
  specialization: string;
  qualification: string;
  registrationNo: string;
  locations: string[];
  isActive: boolean;
}

const EMPTY_FORM: DoctorFormState = {
  id: null,
  isSelf: false,
  name: '',
  email: '',
  password: '',
  phone: '',
  specialization: '',
  qualification: '',
  registrationNo: '',
  locations: [],
  isActive: true,
};

function initialOf(name: string): string {
  return name.replace(/^dr\.?\s*/i, '').trim().charAt(0).toUpperCase() || 'D';
}

export default function DoctorsManager({ adminFetch, currentUser }: DoctorsManagerProps) {
  const { locations: clinicLocations } = useClinicSettings();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<DoctorFormState | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const myEmail = (currentUser?.email || '').trim().toLowerCase();
  const isMine = (d: Doctor) => Boolean(myEmail) && d.email.toLowerCase() === myEmail;
  const iAmListed = doctors.some(isMine);

  const loadDoctors = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch(`/api/admin/doctors?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load doctors.');
      setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load doctors.', 'Load Failed');
    } finally {
      setIsLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      [d.name, d.email, d.phone, d.specialization, d.qualification, d.locations.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [doctors, search]);

  const activeCount = doctors.filter((d) => d.isActive).length;

  /* ---------- Form handlers ---------- */

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setShowPassword(false);
    setLocationDraft('');
    setFormError('');
  };

  const openAddSelf = () => {
    setForm({
      ...EMPTY_FORM,
      isSelf: true,
      name: currentUser?.name || '',
      email: currentUser?.email || '',
    });
    setShowPassword(false);
    setLocationDraft('');
    setFormError('');
  };

  const openEdit = (d: Doctor) => {
    setForm({
      id: d.id,
      isSelf: isMine(d),
      name: d.name,
      email: d.email,
      password: '',
      phone: d.phone,
      specialization: d.specialization,
      qualification: d.qualification,
      registrationNo: d.registrationNo,
      locations: [...d.locations],
      isActive: d.isActive,
    });
    setShowPassword(false);
    setLocationDraft('');
    setFormError('');
  };

  const closeForm = () => {
    if (isSaving) return;
    setForm(null);
  };

  const patchForm = (patch: Partial<DoctorFormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const addLocation = (raw: string) => {
    const value = raw.trim().replace(/,$/, '').trim();
    if (!value || !form) return;
    if (form.locations.some((l) => l.toLowerCase() === value.toLowerCase())) {
      setLocationDraft('');
      return;
    }
    patchForm({ locations: [...form.locations, value] });
    setLocationDraft('');
  };

  const removeLocation = (loc: string) => {
    if (!form) return;
    patchForm({ locations: form.locations.filter((l) => l !== loc) });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Commit a half-typed location so it isn't lost
    const pendingLocation = locationDraft.trim();
    const locations =
      pendingLocation &&
      !form.locations.some((l) => l.toLowerCase() === pendingLocation.toLowerCase())
        ? [...form.locations, pendingLocation]
        : form.locations;

    const isEdit = Boolean(form.id);
    if (!form.name.trim()) return setFormError('Doctor name is required.');
    if (!form.isSelf) {
      if (!form.email.trim()) return setFormError('Login email is required.');
      if (!isEdit && form.password.length < 6) {
        return setFormError('Set a password of at least 6 characters.');
      }
      if (isEdit && form.password && form.password.length < 6) {
        return setFormError('New password must be at least 6 characters (or leave it blank).');
      }
    }

    setIsSaving(true);
    setFormError('');
    try {
      const res = await adminFetch('/api/admin/doctors', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          linkSelf: form.isSelf && !isEdit,
          locations,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Could not save doctor.');
        return;
      }
      toast.success(
        isEdit
          ? `${data.doctor.name} updated.`
          : form.isSelf
            ? 'You are now listed as a doctor.'
            : `${data.doctor.name} added. They can now sign in.`,
        isEdit ? 'Doctor Updated' : 'Doctor Added'
      );
      setForm(null);
      await loadDoctors();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (d: Doctor) => {
    setTogglingId(d.id);
    try {
      const res = await adminFetch('/api/admin/doctors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, isActive: !d.isActive, password: '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update doctor.');
      setDoctors((prev) => prev.map((x) => (x.id === d.id ? data.doctor : x)));
      toast.success(
        data.doctor.isActive ? `${d.name} is active again.` : `${d.name} is now inactive.`,
        data.doctor.isActive ? 'Doctor Activated' : 'Doctor Deactivated'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update doctor.', 'Update Failed');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await adminFetch(`/api/admin/doctors?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete doctor.');
      toast.success(`${deleteTarget.name} was removed.`, 'Doctor Deleted');
      setDeleteTarget(null);
      await loadDoctors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete doctor.', 'Delete Failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const suggestions = clinicLocations.filter(
    (l) => !form?.locations.some((x) => x.toLowerCase() === l.toLowerCase())
  );

  const isEditing = Boolean(form?.id);

  return (
    <div className="tab-pane-fade dm-root">
      <style>{DM_STYLES}</style>

      {/* Header */}
      <div className="dm-head">
        <div>
          <h2 className="dm-title">Doctors</h2>
          <p className="dm-sub">Add doctors, edit their details and give each one a separate login.</p>
        </div>
        <div className="dm-head-actions">
          <input
            type="search"
            className="dm-search"
            placeholder="Search doctors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="dm-primary" onClick={openAdd}>
            <span aria-hidden="true">+</span> Add Doctor
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="dm-stats">
        <div className="dm-stat">
          <strong>{doctors.length}</strong>
          <span>Total doctors</span>
        </div>
        <div className="dm-stat">
          <strong className="ok">{activeCount}</strong>
          <span>Active</span>
        </div>
        <div className="dm-stat">
          <strong className="mute">{doctors.length - activeCount}</strong>
          <span>Inactive</span>
        </div>
      </div>

      {/* Super Admin is also a doctor */}
      {!isLoading && currentUser && !iAmListed && (
        <div className="dm-self">
          <div className="dm-self-text">
            <strong>You are not listed as a doctor yet</strong>
            <span>
              Add yourself so patients can be assigned to you and you can take patients too. You keep
              signing in with your Super Admin login.
            </span>
          </div>
          <button type="button" className="dm-primary" onClick={openAddSelf}>
            Add me as a doctor
          </button>
        </div>
      )}

      {/* List */}
      <div className="dm-card">
        {isLoading ? (
          <div className="dm-empty">Loading doctors…</div>
        ) : filtered.length === 0 ? (
          <div className="dm-empty">
            <strong>{doctors.length === 0 ? 'No doctors yet' : 'No doctors match your search'}</strong>
            <span>
              {doctors.length === 0
                ? 'Click “Add Doctor” to create the first doctor login.'
                : 'Try a different name, email or location.'}
            </span>
          </div>
        ) : (
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Contact &amp; login</th>
                  <th>Locations</th>
                  <th>Status</th>
                  <th className="dm-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className={d.isActive ? '' : 'dm-off'}>
                    <td>
                      <div className="dm-person">
                        <span className="dm-av">{initialOf(d.name)}</span>
                        <div>
                          <div className="dm-name">
                            {d.name}
                            {isMine(d) && <em className="dm-tag you">You · Super Admin</em>}
                          </div>
                          <div className="dm-meta">
                            {[d.specialization, d.qualification].filter(Boolean).join(' · ') ||
                              'No specialization added'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="dm-line">{d.email}</div>
                      <div className="dm-meta">{d.phone || '—'}</div>
                    </td>
                    <td>
                      {d.locations.length ? (
                        <div className="dm-chips">
                          {d.locations.map((l) => (
                            <span key={l} className="dm-chip">
                              {l}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="dm-meta">All locations</span>
                      )}
                    </td>
                    <td>
                      <span className={`dm-status ${d.isActive ? 'on' : 'off'}`}>
                        {d.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="dm-right">
                      <div className="dm-actions">
                        <button type="button" className="dm-btn" onClick={() => openEdit(d)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="dm-btn"
                          disabled={togglingId === d.id}
                          onClick={() => handleToggleActive(d)}
                        >
                          {d.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button type="button" className="dm-btn danger" onClick={() => setDeleteTarget(d)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit drawer */}
      {form && (
        <div className="dm-overlay" onClick={closeForm} role="dialog" aria-modal="true">
          <form className="dm-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSave} noValidate>
            <div className="dm-panel-head">
              <h3>
                {isEditing ? 'Edit Doctor' : form.isSelf ? 'Add Me as a Doctor' : 'Add Doctor'}
              </h3>
              <button type="button" className="dm-x" onClick={closeForm} aria-label="Close">
                ×
              </button>
            </div>

            <div className="dm-panel-body">
              {formError && (
                <div className="dm-error" role="alert">
                  {formError}
                </div>
              )}

              <label className="dm-field">
                <span>Full name *</span>
                <input
                  className="dm-input"
                  value={form.name}
                  onChange={(e) => patchForm({ name: e.target.value })}
                  placeholder="Dr. Full Name"
                  autoFocus
                />
              </label>

              {form.isSelf ? (
                <label className="dm-field">
                  <span>Login email</span>
                  <input className="dm-input" value={form.email} readOnly disabled />
                  <small className="dm-hint">
                    This is your Super Admin login. Your password stays the same.
                  </small>
                </label>
              ) : (
                <div className="dm-grid2">
                  <label className="dm-field">
                    <span>Login email *</span>
                    <input
                      className="dm-input"
                      type="email"
                      value={form.email}
                      onChange={(e) => patchForm({ email: e.target.value })}
                      placeholder="doctor@example.com"
                      autoComplete="off"
                    />
                  </label>
                  <label className="dm-field">
                    <span>{isEditing ? 'New password' : 'Password *'}</span>
                    <div className="dm-pass">
                      <input
                        className="dm-input"
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={(e) => patchForm({ password: e.target.value })}
                        placeholder={isEditing ? 'Leave blank to keep' : 'Min 6 characters'}
                        autoComplete="new-password"
                      />
                      <button type="button" className="dm-show" onClick={() => setShowPassword((v) => !v)}>
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>
                </div>
              )}

              <div className="dm-grid2">
                <label className="dm-field">
                  <span>Phone</span>
                  <input
                    className="dm-input"
                    value={form.phone}
                    onChange={(e) => patchForm({ phone: e.target.value })}
                    placeholder="+91 …"
                  />
                </label>
                <label className="dm-field">
                  <span>Registration no.</span>
                  <input
                    className="dm-input"
                    value={form.registrationNo}
                    onChange={(e) => patchForm({ registrationNo: e.target.value })}
                  />
                </label>
              </div>

              <div className="dm-grid2">
                <label className="dm-field">
                  <span>Specialization</span>
                  <input
                    className="dm-input"
                    value={form.specialization}
                    onChange={(e) => patchForm({ specialization: e.target.value })}
                    placeholder="e.g. Proctologist"
                  />
                </label>
                <label className="dm-field">
                  <span>Qualification</span>
                  <input
                    className="dm-input"
                    value={form.qualification}
                    onChange={(e) => patchForm({ qualification: e.target.value })}
                    placeholder="e.g. MS, FICS"
                  />
                </label>
              </div>

              <div className="dm-field">
                <span>Locations where this doctor sits</span>
                {form.locations.length > 0 && (
                  <div className="dm-chips">
                    {form.locations.map((l) => (
                      <span key={l} className="dm-chip">
                        {l}
                        <button type="button" onClick={() => removeLocation(l)} aria-label={`Remove ${l}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  className="dm-input"
                  value={locationDraft}
                  onChange={(e) => setLocationDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addLocation(locationDraft);
                    }
                  }}
                  placeholder="Type a location and press Enter"
                />
                {suggestions.length > 0 && (
                  <div className="dm-suggest">
                    {suggestions.map((l) => (
                      <button type="button" key={l} onClick={() => addLocation(l)}>
                        + {l}
                      </button>
                    ))}
                  </div>
                )}
                <small className="dm-hint">Leave empty if the doctor can sit at any location.</small>
              </div>

              <label className="dm-check">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => patchForm({ isActive: e.target.checked })}
                />
                <span>Active (can be assigned patients{form.isSelf ? '' : ' and sign in'})</span>
              </label>
            </div>

            <div className="dm-panel-foot">
              <button type="button" className="dm-btn" onClick={closeForm} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="dm-primary" disabled={isSaving}>
                {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : form.isSelf ? 'Add Me' : 'Add Doctor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="dm-overlay dm-center" onClick={() => !isDeleting && setDeleteTarget(null)}>
          <div className="dm-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {deleteTarget.name}?</h3>
            <p>
              {isMine(deleteTarget)
                ? 'You will no longer be listed as a doctor. Your Super Admin login is not affected.'
                : 'Their login will stop working immediately. To keep the record but block sign-in, use Deactivate instead.'}
            </p>
            <div className="dm-panel-foot">
              <button type="button" className="dm-btn" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                Cancel
              </button>
              <button type="button" className="dm-btn danger solid" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DM_STYLES = `
.dm-root{display:flex;flex-direction:column;gap:18px;padding-bottom:40px}
.dm-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.dm-title{margin:0;font-size:24px;font-weight:800;color:#0f172a}
.dm-sub{margin:4px 0 0;color:#64748b;font-size:14px}
.dm-head-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.dm-search{height:42px;width:260px;padding:0 14px;border:1px solid #d7dcea;border-radius:10px;background:#fff;font-size:14px;color:#0f172a;outline:none}
.dm-search:focus,.dm-input:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.dm-primary{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 18px;border:0;border-radius:10px;background:#f97316;color:#fff;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(249,115,22,.28)}
.dm-primary:hover:not(:disabled){background:#ea580c}
.dm-primary:disabled{opacity:.6;cursor:not-allowed}
.dm-primary span{font-size:18px;line-height:1}
.dm-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dm-stat{background:#fff;border:1px solid #e6e9f5;border-radius:14px;padding:14px 18px;display:flex;flex-direction:column;gap:2px}
.dm-stat strong{font-size:24px;font-weight:800;color:#1e1b4b}
.dm-stat strong.ok{color:#059669}
.dm-stat strong.mute{color:#94a3b8}
.dm-stat span{font-size:12.5px;color:#64748b;font-weight:600}
.dm-self{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:16px 20px;border-radius:14px;background:linear-gradient(135deg,#eef2ff,#fdf2f8);border:1px solid #c7d2fe}
.dm-self-text{display:flex;flex-direction:column;gap:3px;max-width:640px}
.dm-self-text strong{color:#312e81;font-size:15px}
.dm-self-text span{color:#475569;font-size:13px;line-height:1.45}
.dm-card{background:#fff;border:1px solid #e6e9f5;border-radius:16px;overflow:hidden}
.dm-table-wrap{overflow-x:auto}
.dm-table{width:100%;border-collapse:collapse;min-width:820px}
.dm-table th{background:#f6f7ff;color:#312e81;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:13px 18px;white-space:nowrap}
.dm-table td{padding:16px 18px;border-top:1px solid #f1f2fe;vertical-align:middle}
.dm-table tr:hover td{background:#fafbff}
.dm-right{text-align:right !important}
.dm-off{opacity:.62}
.dm-person{display:flex;align-items:center;gap:12px}
.dm-av{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.dm-name{font-weight:700;color:#0f172a;font-size:14.5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dm-tag{font-style:normal;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}
.dm-tag.you{background:#fdf2f8;color:#9d174d;border:1px solid #fbcfe8}
.dm-meta{font-size:12.5px;color:#64748b;margin-top:2px}
.dm-line{font-size:13.5px;color:#1e293b}
.dm-chips{display:flex;flex-wrap:wrap;gap:6px}
.dm-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca;font-size:12px;font-weight:600}
.dm-chip button{border:0;background:transparent;color:#4338ca;cursor:pointer;font-size:15px;line-height:1;padding:0}
.dm-status{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700}
.dm-status.on{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
.dm-status.off{background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0}
.dm-actions{display:inline-flex;gap:8px;white-space:nowrap}
.dm-btn{height:34px;padding:0 14px;border-radius:9px;border:1px solid #d7dcea;background:#fff;color:#1e293b;font-size:13px;font-weight:600;cursor:pointer}
.dm-btn:hover:not(:disabled){background:#f6f7ff;border-color:#c7d2fe}
.dm-btn:disabled{opacity:.55;cursor:not-allowed}
.dm-btn.danger{color:#b91c1c;border-color:#fecaca}
.dm-btn.danger:hover:not(:disabled){background:#fef2f2}
.dm-btn.danger.solid{background:#dc2626;border-color:#dc2626;color:#fff}
.dm-empty{padding:48px 20px;text-align:center;color:#64748b;display:flex;flex-direction:column;gap:6px;font-size:14px}
.dm-empty strong{color:#0f172a;font-size:16px}
.dm-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:1000;display:flex;justify-content:flex-end}
.dm-overlay.dm-center{justify-content:center;align-items:center;padding:16px}
.dm-panel{width:min(540px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(15,23,42,.18)}
.dm-panel-head{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid #e2e8f0}
.dm-panel-head h3{margin:0;font-size:19px;color:#0f172a}
.dm-x{border:0;background:transparent;font-size:28px;line-height:1;cursor:pointer;color:#64748b}
.dm-panel-body{padding:20px 24px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px}
.dm-panel-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 24px;border-top:1px solid #e2e8f0}
.dm-error{padding:10px 14px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:13.5px}
.dm-field{display:flex;flex-direction:column;gap:6px}
.dm-field>span{font-size:12.5px;font-weight:700;color:#334155}
.dm-input{width:100%;height:42px;padding:0 12px;border:1px solid #d7dcea;border-radius:10px;background:#fff;font-size:14px;color:#0f172a;outline:none;box-sizing:border-box}
.dm-input:disabled{background:#f1f5f9;color:#64748b}
.dm-hint{color:#94a3b8;font-size:12px}
.dm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.dm-pass{position:relative}
.dm-pass .dm-input{padding-right:58px}
.dm-show{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#4338ca;font-size:12px;font-weight:700;cursor:pointer}
.dm-suggest{display:flex;flex-wrap:wrap;gap:6px}
.dm-suggest button{border:1px dashed #94a3b8;background:#fff;color:#475569;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer}
.dm-check{display:flex;align-items:center;gap:8px;font-size:13.5px;color:#1e293b;cursor:pointer}
.dm-confirm{background:#fff;border-radius:14px;width:min(430px,100%);padding-top:22px;box-shadow:0 20px 50px rgba(15,23,42,.3)}
.dm-confirm h3{margin:0 24px 8px;font-size:17px;color:#0f172a}
.dm-confirm p{margin:0 24px 16px;color:#475569;font-size:13.5px;line-height:1.5}
@media(max-width:700px){.dm-grid2{grid-template-columns:1fr}.dm-search{width:100%}.dm-head-actions{width:100%}.dm-stats{grid-template-columns:repeat(3,1fr);gap:8px}}
`;