'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Appointment } from '@/lib/storage';
import { toast } from '@/components/ui/Toast';
import { Prescription, PrescriptionMedicine, emptyMedicine } from '@/lib/prescriptionTemplate';
import { Medicine } from '@/lib/medicines';
import { IconCross, IconPlus, IconTrash, IconMail, IconRefresh, IconFileText, IconPill } from './AdminIcons';

// Fallback potency list, used only when the selected medicine has no potencies saved in the database.
const POTENCIES = ['Q', '3X', '6X', '6C', '12C', '30C', '200C', '1M', '10M'];

interface PrescriptionModalProps {
  appointment: Appointment | null;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  availableMedicines?: Medicine[];
}

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Saves a Blob to the user's device as a file download. */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Reads the filename the server suggested, falling back to a sensible default. */
function fileNameFromResponse(res: Response, fallback: string): string {
  const header = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : fallback;
}

/* ---------------------------------------------------------------------------
   Custom suggestion input — replaces the native <datalist> so the dropdown
   is always white (native datalist popups follow the OS / browser theme and
   can render black).
   --------------------------------------------------------------------------- */
interface SuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

function SuggestInput({ value, onChange, options, placeholder, className }: SuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const q = value.trim().toLowerCase();

  const filtered = useMemo(() => {
    const starts: string[] = [];
    const contains: string[] = [];
    for (const o of options) {
      const l = o.toLowerCase();
      if (!q || l.startsWith(q)) starts.push(o);
      else if (l.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, 50);
  }, [options, q]);

  // Hide the list once the typed text exactly equals the only remaining option
  const isExactOnly = filtered.length === 1 && filtered[0].toLowerCase() === q;
  const showList = open && filtered.length > 0 && !isExactOnly;

  const select = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === 'ArrowDown') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      select(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        className={className}
        style={{ width: '100%' }}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={handleKeyDown}
      />

      {showList && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            margin: 0,
            padding: '4px',
            listStyle: 'none',
            maxHeight: '220px',
            overflowY: 'auto',
            background: '#FFFFFF',
            color: '#0F172A',
            colorScheme: 'light',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
          }}
        >
          {filtered.map((opt, idx) => (
            <li
              key={opt}
              role="option"
              aria-selected={idx === active}
              // onMouseDown fires before the input's blur, so the click isn't lost
              onMouseDown={(e) => {
                e.preventDefault();
                select(opt);
              }}
              onMouseEnter={() => setActive(idx)}
              style={{
                padding: '8px 10px',
                borderRadius: '7px',
                fontSize: '13.5px',
                cursor: 'pointer',
                color: '#0F172A',
                background: idx === active ? '#EEF0FF' : '#FFFFFF',
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PrescriptionModal({
  appointment,
  adminFetch,
  onClose,
  availableMedicines = [],
}: PrescriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [date, setDate] = useState(todayIst());
  const [diagnosis, setDiagnosis] = useState('');
  const [medicines, setMedicines] = useState<PrescriptionMedicine[]>([emptyMedicine()]);
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [sendTo, setSendTo] = useState('');
  const [busy, setBusy] = useState<'save' | 'pdf' | 'send' | 'whatsapp' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [waPanelOpen, setWaPanelOpen] = useState(false);
  const [waInfo, setWaInfo] = useState<{ status: string; qr: string | null } | null>(null);
  const [waPendingId, setWaPendingId] = useState<string | null>(null);
  const sendWaRef = useRef<((id: string) => void) | null>(null);

  // Load existing prescription (if any) whenever a different appointment is opened
  useEffect(() => {
    if (!appointment) return;
    let cancelled = false;
    setLoading(true);
    setPrescription(null);
    setDirty(false);
    setSendTo(appointment.email || '');

    (async () => {
      try {
        const res = await adminFetch(`/api/admin/prescriptions?appointmentId=${encodeURIComponent(appointment.id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Failed to load prescription');
        const rx: Prescription | null = data.prescription;
        setPrescription(rx);
        if (rx) {
          setDate(rx.date);
          setDiagnosis(rx.diagnosis);
          setMedicines(rx.medicines.length ? rx.medicines : [emptyMedicine()]);
          setAdvice(rx.advice);
          setFollowUp(rx.followUp);
        } else {
          setDate(todayIst());
          setDiagnosis(appointment.reason || '');
          setMedicines([emptyMedicine()]);
          setAdvice('');
          setFollowUp('');
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load prescription');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appointment, adminFetch]);

  // Suggestions come ONLY from the clinic's medicine database
  const remedyOptions = useMemo(() => {
    const seen = new Set<string>();
    return (availableMedicines || [])
      .map((m) => m.name.trim())
      .filter((n) => {
        if (!n) return false;
        const k = n.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [availableMedicines]);

  // Potency suggestions for a given remedy: that remedy's saved potencies from the DB,
  // falling back to the standard list only if none are saved.
  const potencyOptionsFor = (remedyName: string): string[] => {
    const matched = (availableMedicines || []).find(
      (am) => am.name.trim().toLowerCase() === remedyName.trim().toLowerCase()
    );
    if (matched && matched.potency) {
      const list = matched.potency
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      if (list.length) return Array.from(new Set(list));
    }
    return POTENCIES;
  };

  // While the QR panel is open: poll the connection status, and send automatically once linked
  useEffect(() => {
    if (!waPanelOpen) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await adminFetch(`/api/admin/whatsapp?t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setWaInfo({ status: data.status, qr: data.qr });
        if (data.status === 'connected') {
          setWaPanelOpen(false);
          toast.success('WhatsApp linked successfully.');
          if (waPendingId) {
            const id = waPendingId;
            setWaPendingId(null);
            sendWaRef.current?.(id);
          }
        }
      } catch {
        // keep polling
      }
    };

    void poll();
    const timer = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waPanelOpen]);

  if (!appointment) return null;

  const updateMed = (index: number, patch: Partial<PrescriptionMedicine>) => {
    setMedicines((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m;
        const updated = { ...m, ...patch };
        // If remedy name was changed and potency is currently empty, check if remedy has default potencies
        if (patch.name && !m.potency) {
          const matchedMed = (availableMedicines || []).find(
            (am) => am.name.trim().toLowerCase() === patch.name!.trim().toLowerCase()
          );
          if (matchedMed && matchedMed.potency) {
            const firstPotency = matchedMed.potency.split(',')[0].trim();
            if (firstPotency) {
              updated.potency = firstPotency;
            }
          }
        }
        return updated;
      })
    );
    setDirty(true);
  };

  const addMed = () => {
    setMedicines((prev) => [...prev, emptyMedicine()]);
    setDirty(true);
  };

  const removeMed = (index: number) => {
    setMedicines((prev) => (prev.length === 1 ? [emptyMedicine()] : prev.filter((_, i) => i !== index)));
    setDirty(true);
  };

  const hasMedicine = medicines.some((m) => m.name.trim());

  /** Saves the current form; returns the saved prescription, or null on failure. */
  const save = async (silent = false): Promise<Prescription | null> => {
    if (!hasMedicine) {
      toast.error('Add at least one medicine first.');
      return null;
    }
    try {
      const res = await adminFetch('/api/admin/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.id, date, diagnosis, medicines, advice, followUp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save prescription');
      setPrescription(data.prescription);
      setDirty(false);
      if (!silent) toast.success('Prescription saved.');
      return data.prescription as Prescription;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save prescription');
      return null;
    }
  };

  const handleSave = async () => {
    setBusy('save');
    await save();
    setBusy(null);
  };

  // Print = save the latest changes, then download the prescription as a PDF
  const handleDownloadPdf = async () => {
    setBusy('pdf');
    try {
      const saved = await save(true);
      if (!saved) return;
      const res = await adminFetch(`/api/admin/prescriptions/${saved.id}/pdf`);
      if (!res.ok) {
        let message = 'Failed to generate PDF';
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          // not JSON
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      downloadBlob(blob, fileNameFromResponse(res, `Prescription-${saved.date}.pdf`));
      toast.success('Prescription PDF downloaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setBusy(null);
    }
  };

  /** Sends the saved prescription PDF to the patient on WhatsApp (automatic, no manual attach). */
  const sendWhatsAppFor = async (prescriptionId: string) => {
    setBusy('whatsapp');
    try {
      const res = await adminFetch(`/api/admin/prescriptions/${prescriptionId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: appointment.phone }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === 'not_connected') {
        // Clinic WhatsApp is not linked yet -> show the QR code panel
        setWaPendingId(prescriptionId);
        setWaInfo(null);
        setWaPanelOpen(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to send WhatsApp message');
      toast.success(`Prescription PDF sent on WhatsApp to +${data.sentTo}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send WhatsApp message');
    } finally {
      setBusy(null);
    }
  };

  sendWaRef.current = (id: string) => {
    void sendWhatsAppFor(id);
  };

  const handleWhatsApp = async () => {
    setBusy('whatsapp');
    const saved = await save(true);
    if (!saved) {
      setBusy(null);
      return;
    }
    await sendWhatsAppFor(saved.id);
  };

  const handleSend = async () => {
    const to = sendTo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast.error('Enter a valid patient email address.');
      return;
    }
    setBusy('send');
    try {
      const saved = await save(true);
      if (!saved) return;
      const res = await adminFetch(`/api/admin/prescriptions/${saved.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      setPrescription({ ...saved, emailedAt: new Date().toISOString() });
      toast.success(`Prescription PDF emailed to ${to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setBusy(null);
    }
  };

  const handleClose = () => {
    if (dirty && !window.confirm('You have unsaved changes. Close without saving?')) return;
    onClose();
  };

  return (
    <div className="admin-drawer-overlay" role="dialog" aria-modal="true" aria-label="Prescription" onClick={handleClose}>
      <aside className="admin-drawer-panel admin-drawer-panel-rx" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header — matches the Notes / Reschedule panel style */}
        <header className="drawer-header">
          <div className="drawer-title-wrap">
            <span className="drawer-icon-badge" style={{ background: '#EEF0FF', color: 'var(--primary)' }} aria-hidden="true">
              <IconPill size={22} />
            </span>
            <div>
              <h3>Prescription</h3>
              <p className="drawer-subtitle">
                <strong>{appointment.fullName}</strong>
                {appointment.age ? ` · Age ${appointment.age}` : ''} · {appointment.phone}
                {prescription?.emailedAt && <span className="rx-sent-badge">Emailed</span>}
              </p>
            </div>
          </div>
          <button type="button" className="btn-drawer-close" onClick={handleClose} aria-label="Close prescription panel">
            <IconCross />
          </button>
        </header>

        {loading ? (
          <div className="rx-loading">
            <IconRefresh size={20} /> Loading…
          </div>
        ) : (
          <div className="rx-body">
            <div className="rx-row-2">
              <label className="rx-field">
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} />
              </label>
              <label className="rx-field">
                <span>Complaints / Diagnosis</span>
                <input
                  type="text"
                  value={diagnosis}
                  placeholder="e.g. Chronic acidity, bloating"
                  onChange={(e) => { setDiagnosis(e.target.value); setDirty(true); }}
                />
              </label>
            </div>

            <div className="rx-section-title">
              <span>Medicines</span>
              <button type="button" className="rx-add-btn" onClick={addMed}>
                <IconPlus /> Add medicine
              </button>
            </div>

            {medicines.map((m, i) => (
              <div className="rx-med-card" key={i}>
                <div className="rx-med-top">
                  <span className="rx-med-num">{i + 1}</span>
                  <SuggestInput
                    className="rx-input rx-med-name"
                    placeholder="Type medicine name…"
                    options={remedyOptions}
                    value={m.name}
                    onChange={(v) => updateMed(i, { name: v })}
                  />
                  <SuggestInput
                    className="rx-input rx-med-potency"
                    placeholder="Potency"
                    options={potencyOptionsFor(m.name)}
                    value={m.potency}
                    onChange={(v) => updateMed(i, { potency: v })}
                  />
                  <button type="button" className="rx-med-remove" onClick={() => removeMed(i)} title="Remove medicine">
                    <IconTrash size={14} />
                  </button>
                </div>

                <div className="rx-med-grid">
                  <label className="rx-field">
                    <span>Quantity</span>
                    <input
                      type="text"
                      placeholder="e.g. 4 pills / 5 drops"
                      value={m.quantity}
                      onChange={(e) => updateMed(i, { quantity: e.target.value })}
                    />
                  </label>

                  <div className="rx-field">
                    <span>When to take</span>
                    <div className="rx-chips">
                      {(
                        [
                          ['morning', 'Morning'],
                          ['afternoon', 'Afternoon'],
                          ['night', 'Night'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          type="button"
                          key={key}
                          className={`rx-chip ${m[key] ? 'on' : ''}`}
                          aria-pressed={m[key]}
                          onClick={() => updateMed(i, { [key]: !m[key] } as Partial<PrescriptionMedicine>)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="rx-field">
                    <span>Food</span>
                    <select
                      value={m.timing}
                      onChange={(e) => updateMed(i, { timing: e.target.value as PrescriptionMedicine['timing'] })}
                    >
                      <option value="any">No restriction</option>
                      <option value="before">Before food</option>
                      <option value="after">After food</option>
                      <option value="with">With food</option>
                    </select>
                  </label>

                  <label className="rx-field">
                    <span>Duration</span>
                    <input
                      type="text"
                      placeholder="e.g. 7 days"
                      value={m.duration}
                      onChange={(e) => updateMed(i, { duration: e.target.value })}
                    />
                  </label>

                  <label className="rx-field rx-span-all">
                    <span>Special instructions (optional)</span>
                    <input
                      type="text"
                      placeholder="e.g. Dissolve under the tongue, avoid mint/coffee 30 min before"
                      value={m.instructions}
                      onChange={(e) => updateMed(i, { instructions: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            ))}

            <label className="rx-field">
              <span>Advice / Diet</span>
              <textarea
                rows={3}
                value={advice}
                placeholder="Diet, lifestyle, things to avoid…"
                onChange={(e) => { setAdvice(e.target.value); setDirty(true); }}
              />
            </label>

            <label className="rx-field">
              <span>Follow-up</span>
              <input
                type="text"
                value={followUp}
                placeholder="e.g. After 2 weeks / 2026-11-05"
                onChange={(e) => { setFollowUp(e.target.value); setDirty(true); }}
              />
            </label>

            <div className="rx-send-box">
              <label className="rx-field">
                <span>
                  <IconMail size={13} /> Send PDF to patient email
                </span>
                <input type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="patient@email.com" />
              </label>
            </div>
          </div>
        )}

        <div className="rx-footer">
          <button type="button" className="rx-btn rx-btn-ghost" onClick={handleClose}>
            Close
          </button>
          <div className="rx-footer-actions">
            <button type="button" className="rx-btn rx-btn-outline" onClick={handleSave} disabled={busy !== null || loading}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="rx-btn rx-btn-outline" onClick={handleDownloadPdf} disabled={busy !== null || loading}>
              <IconFileText size={14} /> {busy === 'pdf' ? 'Preparing PDF…' : 'Print / Download PDF'}
            </button>
            <button type="button" className="rx-btn rx-btn-outline" onClick={handleWhatsApp} disabled={busy !== null || loading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.5 3.5A11.8 11.8 0 0 0 12 0 12 12 0 0 0 1.6 17.9L0 24l6.3-1.6A12 12 0 0 0 12 24a12 12 0 0 0 8.5-20.5zM12 21.9a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.9 9.9 0 1 1 12 21.9zm5.4-7.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.6.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6a.6.6 0 0 0 0-.6l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.6.9 3.5.7a3 3 0 0 0 2-1.4 2.4 2.4 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.3z" />
              </svg>{' '}
              {busy === 'whatsapp' ? 'Sending…' : 'Send on WhatsApp'}
            </button>
            <button type="button" className="rx-btn rx-btn-primary" onClick={handleSend} disabled={busy !== null || loading}>
              <IconMail size={14} /> {busy === 'send' ? 'Sending…' : 'Email PDF to Patient'}
            </button>
          </div>
        </div>
      </aside>

      {waPanelOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15,23,42,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => { setWaPanelOpen(false); setWaPendingId(null); }}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%',
              textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Link clinic WhatsApp</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              Open WhatsApp on the clinic phone &rarr; <strong>Settings &rarr; Linked devices &rarr; Link a device</strong> and scan this code. This is needed only once.
            </p>
            {waInfo?.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={waInfo.qr} alt="WhatsApp QR code" width={260} height={260} style={{ margin: '0 auto' }} />
            ) : (
              <div style={{ padding: '60px 0', color: '#64748b', fontSize: 14 }}>Generating QR code…</div>
            )}
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#64748b' }}>
              The prescription will be sent automatically after linking.
            </p>
            <button
              type="button"
              className="rx-btn rx-btn-ghost"
              style={{ marginTop: 14 }}
              onClick={() => { setWaPanelOpen(false); setWaPendingId(null); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}