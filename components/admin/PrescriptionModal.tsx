'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Appointment } from '@/lib/storage';
import { toast } from '@/components/ui/Toast';
import {
  Prescription,
  PrescriptionMedicine,
  emptyMedicine,
  describeSchedule,
  describeTiming,
  formatRxDate,
  renderPrescriptionHtml,
} from '@/lib/prescriptionTemplate';
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

function scheduleText(m: Pick<PrescriptionMedicine, 'morning' | 'afternoon' | 'night'>): string {
  return `${m.morning ? 1 : 0}-${m.afternoon ? 1 : 0}-${m.night ? 1 : 0}`;
}

/** "101", "1-0-1", "1 0 1" -> morning/afternoon/night flags (missing positions = off). */
function parseSchedule(text: string): Pick<PrescriptionMedicine, 'morning' | 'afternoon' | 'night'> {
  const d = text.replace(/[^01]/g, '');
  return { morning: d[0] === '1', afternoon: d[1] === '1', night: d[2] === '1' };
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
  inputRef?: React.Ref<HTMLInputElement>;
  /** Called when Enter is pressed and no suggestion is highlighted. */
  onEnter?: () => void;
}

function SuggestInput({ value, onChange, options, placeholder, className, inputRef, onEnter }: SuggestInputProps) {
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
    // Fast entry: Tab accepts the best match for what was typed, then moves to the next field
    if (e.key === 'Tab' && !e.shiftKey && showList && q && filtered.length > 0) {
      const pick = active >= 0 ? filtered[active] : filtered[0];
      if (pick && pick.toLowerCase() !== q) onChange(pick);
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === 'Enter' && (!showList || active < 0)) {
      if (onEnter) {
        e.preventDefault();
        e.stopPropagation(); // the form-level Enter handler must not add it a second time
        setOpen(false);
        onEnter();
      }
      return;
    }
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
      e.stopPropagation();
      select(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
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
  const [medicines, setMedicines] = useState<PrescriptionMedicine[]>([]);
  // Single entry form (above the table) + which table row is being edited
  const [entry, setEntry] = useState<PrescriptionMedicine>(emptyMedicine());
  const [editIndex, setEditIndex] = useState<number | null>(null);
  // Earlier prescriptions of this patient
  const [history, setHistory] = useState<Prescription[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Preview overlay (current form, or an old prescription)
  const [previewRx, setPreviewRx] = useState<Prescription | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<string | null>(null);
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
    setHistory([]);
    setShowAllHistory(false);
    setEntry(emptyMedicine());
    setEditIndex(null);
    setPreviewRx(null);

    (async () => {
      try {
        const res = await adminFetch(`/api/admin/prescriptions?appointmentId=${encodeURIComponent(appointment.id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Failed to load prescription');
        const rx: Prescription | null = data.prescription;
        setPrescription(rx);
        setHistory(Array.isArray(data.history) ? data.history : []);
        if (rx) {
          setDate(rx.date);
          setDiagnosis(rx.diagnosis);
          setMedicines(rx.medicines);
          setAdvice(rx.advice);
          setFollowUp(rx.followUp);
        } else {
          setDate(todayIst());
          setDiagnosis(appointment.reason || '');
          setMedicines([]);
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

  // Ready to type: put the cursor in the medicine name as soon as the form is shown
  useEffect(() => {
    if (appointment && !loading) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [appointment, loading]);

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

  /** Updates the single entry form (auto-fills the first saved potency of a chosen remedy). */
  const updateEntry = (patch: Partial<PrescriptionMedicine>) => {
    setEntry((prev) => {
      const updated = { ...prev, ...patch };
      if (patch.name && !prev.potency) {
        const matchedMed = (availableMedicines || []).find(
          (am) => am.name.trim().toLowerCase() === patch.name!.trim().toLowerCase()
        );
        const firstPotency = matchedMed?.potency?.split(',')[0].trim();
        if (firstPotency) updated.potency = firstPotency;
      }
      return updated;
    });
  };

  /** Adds the entry to the table (or updates the row being edited). */
  const submitEntry = () => {
    if (!entry.name.trim()) {
      toast.error('Enter the medicine name first.');
      return;
    }
    setMedicines((prev) =>
      editIndex === null ? [...prev, { ...entry }] : prev.map((m, i) => (i === editIndex ? { ...entry } : m))
    );
    // Keep quantity / dose / food / duration for the next medicine (usually the same), clear the rest
    setEntry({
      ...emptyMedicine(),
      quantity: entry.quantity,
      morning: entry.morning,
      afternoon: entry.afternoon,
      night: entry.night,
      timing: entry.timing,
      duration: entry.duration,
    });
    setScheduleDraft(null);
    setEditIndex(null);
    setDirty(true);
    setTimeout(() => {
      nameInputRef.current?.focus();
      if (tableWrapRef.current) tableWrapRef.current.scrollTop = tableWrapRef.current.scrollHeight;
    }, 30);
  };

  /** Keyboard shortcuts: Enter adds the medicine, Ctrl+Enter saves, Alt+P previews. */
  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
      return;
    }
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      openPreview();
      return;
    }
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && target.closest('.rx-entry-form') && target.tagName !== 'BUTTON') {
      e.preventDefault();
      submitEntry();
    }
  };

  const editMed = (index: number) => {
    setEntry({ ...medicines[index] });
    setScheduleDraft(null);
    setEditIndex(index);
    setTimeout(() => nameInputRef.current?.focus(), 30);
  };

  const cancelEdit = () => {
    setEntry(emptyMedicine());
    setScheduleDraft(null);
    setEditIndex(null);
    setTimeout(() => nameInputRef.current?.focus(), 30);
  };

  const removeMed = (index: number) => {
    setMedicines((prev) => prev.filter((_, i) => i !== index));
    if (editIndex !== null) cancelEdit();
    setDirty(true);
  };

  const hasMedicine = medicines.length > 0;

  /** Preview of what is currently typed in the form (not saved yet). */
  const buildPreviewRx = (): Prescription => ({
    id: prescription?.id || 'preview',
    appointmentId: appointment.id,
    patientName: appointment.fullName,
    patientEmail: appointment.email,
    patientPhone: appointment.phone,
    patientAge: appointment.age,
    date,
    diagnosis,
    medicines: medicines.filter((m) => m.name.trim()),
    advice,
    followUp,
    createdAt: prescription?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const openPreview = () => {
    if (!hasMedicine) {
      toast.error('Add at least one medicine to preview.');
      return;
    }
    setPreviewRx(buildPreviewRx());
  };

  /** Copies medicines (and diagnosis if empty) of an earlier prescription into this one. */
  const reuseFromHistory = (rx: Prescription) => {
    setMedicines(rx.medicines.map((m) => ({ ...m })));
    if (!diagnosis.trim()) setDiagnosis(rx.diagnosis);
    if (!advice.trim()) setAdvice(rx.advice);
    setDirty(true);
    toast.success(`Copied ${rx.medicines.length} medicine${rx.medicines.length === 1 ? '' : 's'} from ${formatRxDate(rx.date)}.`);
  };

  /** Saves the current form; returns the saved prescription, or null on failure. */
  const save = async (silent = false): Promise<Prescription | null> => {
    if (entry.name.trim()) {
      toast.error('Click "Add" to put the medicine you typed into the list first.');
      return null;
    }
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
          <div className="rx-body" onKeyDown={handleBodyKeyDown}>
            {history.length > 0 && (
              <div className="rx-history">
                <div className="rx-history-head">
                  <strong>Last prescription · {formatRxDate(history[0].date)}</strong>
                  {history.length > 1 && (
                    <button type="button" className="rx-table-btn" onClick={() => setShowAllHistory((v) => !v)}>
                      {showAllHistory ? 'Hide history' : `All history (${history.length})`}
                    </button>
                  )}
                </div>
                {(showAllHistory ? history : history.slice(0, 1)).length > 0 && (
                  <div className="rx-history-list">
                    {(showAllHistory ? history : history.slice(0, 1)).map((h) => (
                      <div className="rx-history-item" key={h.id}>
                        <div className="rx-history-main">
                          <span className="rx-history-date">{formatRxDate(h.date)}</span>
                          {h.diagnosis ? <span className="rx-history-diag">{h.diagnosis}</span> : null}
                          <span className="rx-history-meds">
                            {h.medicines.map((m) => `${m.name}${m.potency ? ` ${m.potency}` : ''}`).join(', ') || 'No medicines'}
                          </span>
                        </div>
                        <div className="rx-history-actions">
                          <button type="button" className="rx-table-btn" onClick={() => setPreviewRx(h)}>
                            View
                          </button>
                          <button type="button" className="rx-table-btn" onClick={() => reuseFromHistory(h)}>
                            Copy medicines
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
              <span>{editIndex === null ? 'Add medicine' : `Edit medicine #${editIndex + 1}`}</span>
            </div>

            <div className="rx-med-card rx-entry-form">
              <div className="rx-quick-grid">
                <label className="rx-field rx-q-name">
                  <span>Medicine</span>
                  <SuggestInput
                    className="rx-input"
                    placeholder="Type name, Tab to accept"
                    options={remedyOptions}
                    value={entry.name}
                    onChange={(v) => updateEntry({ name: v })}
                    inputRef={nameInputRef}
                    onEnter={submitEntry}
                  />
                </label>
                <label className="rx-field rx-q-potency">
                  <span>Potency</span>
                  <SuggestInput
                    className="rx-input"
                    placeholder="30C"
                    options={potencyOptionsFor(entry.name)}
                    value={entry.potency}
                    onChange={(v) => updateEntry({ potency: v })}
                    onEnter={submitEntry}
                  />
                </label>
                <label className="rx-field rx-q-qty">
                  <span>Quantity</span>
                  <input
                    type="text"
                    placeholder="4 pills"
                    value={entry.quantity}
                    onChange={(e) => updateEntry({ quantity: e.target.value })}
                  />
                </label>
                <div className="rx-field rx-q-dose">
                  <span>Dose M-A-N</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="1-0-1"
                    maxLength={5}
                    value={scheduleDraft ?? scheduleText(entry)}
                    title="Morning-Afternoon-Night. Type 101 for morning + night, 111 for all three, 100 for morning only"
                    onChange={(e) => {
                      setScheduleDraft(e.target.value);
                      updateEntry(parseSchedule(e.target.value));
                    }}
                    onBlur={() => setScheduleDraft(null)}
                  />
                  <div className="rx-chips rx-chips-mini" aria-hidden="true">
                    {(
                      [
                        ['morning', 'M'],
                        ['afternoon', 'A'],
                        ['night', 'N'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        tabIndex={-1}
                        className={`rx-chip ${entry[key] ? 'on' : ''}`}
                        onClick={() => {
                          setScheduleDraft(null);
                          updateEntry({ [key]: !entry[key] } as Partial<PrescriptionMedicine>);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="rx-field rx-q-food">
                  <span>Food</span>
                  <select
                    value={entry.timing}
                    onChange={(e) => updateEntry({ timing: e.target.value as PrescriptionMedicine['timing'] })}
                  >
                    <option value="any">Any time</option>
                    <option value="before">Before food</option>
                    <option value="after">After food</option>
                    <option value="with">With food</option>
                  </select>
                </label>
                <label className="rx-field rx-q-duration">
                  <span>Duration</span>
                  <input
                    type="text"
                    placeholder="7 days"
                    value={entry.duration}
                    onChange={(e) => updateEntry({ duration: e.target.value })}
                  />
                </label>
                <label className="rx-field rx-q-note">
                  <span>Special instructions (optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. Dissolve under the tongue, avoid mint/coffee 30 min before"
                    value={entry.instructions}
                    onChange={(e) => updateEntry({ instructions: e.target.value })}
                  />
                </label>
                <div className="rx-q-actions">
                  {editIndex !== null && (
                    <button type="button" className="rx-btn rx-btn-ghost" onClick={cancelEdit}>
                      Cancel
                    </button>
                  )}
                  <button type="button" className="rx-add-btn" onClick={submitEntry}>
                    <IconPlus /> {editIndex === null ? 'Add' : 'Update'}
                  </button>
                </div>
              </div>
              <p className="rx-shortcuts">
                <kbd>Tab</kbd> next field &nbsp;·&nbsp; <kbd>Enter</kbd> add medicine &nbsp;·&nbsp; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save
                &nbsp;·&nbsp; <kbd>Alt</kbd>+<kbd>P</kbd> preview &nbsp;·&nbsp; dose: type <kbd>101</kbd> for morning + night
              </p>
            </div>

            <div className="rx-section-title">
              <span>Prescribed medicines ({medicines.length})</span>
            </div>
            {medicines.length === 0 ? (
              <p className="rx-empty">No medicines added yet. Fill the form above and click “Add to prescription”.</p>
            ) : (
              <div className="rx-table-wrap" ref={tableWrapRef}>
                <table className="rx-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Medicine</th>
                      <th>Qty</th>
                      <th>When</th>
                      <th>Duration</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {medicines.map((m, i) => (
                      <tr key={i} className={editIndex === i ? 'is-editing' : ''}>
                        <td>{i + 1}</td>
                        <td>
                          <strong>{m.name}</strong>
                          {m.potency ? <span className="rx-table-potency"> {m.potency}</span> : null}
                          {m.instructions ? <div className="rx-table-note">{m.instructions}</div> : null}
                        </td>
                        <td>{m.quantity || '—'}</td>
                        <td>
                          {describeSchedule(m)}
                          {describeTiming(m.timing) ? <div className="rx-table-note">{describeTiming(m.timing)}</div> : null}
                        </td>
                        <td>{m.duration || '—'}</td>
                        <td className="rx-table-actions">
                          <button type="button" className="rx-table-btn" onClick={() => editMed(i)}>
                            Edit
                          </button>
                          <button type="button" className="rx-med-remove" onClick={() => removeMed(i)} title="Remove medicine">
                            <IconTrash size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
            <button type="button" className="rx-btn rx-btn-outline" onClick={openPreview} disabled={busy !== null || loading}>
              <IconFileText size={14} /> Preview
            </button>
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

      {previewRx && (
        <div className="rx-preview-overlay" onClick={() => setPreviewRx(null)} role="dialog" aria-modal="true" aria-label="Prescription preview">
          <div className="rx-preview-box" onClick={(e) => e.stopPropagation()}>
            <div className="rx-preview-bar">
              <strong>
                Prescription preview · {formatRxDate(previewRx.date)}
                {previewRx.id !== 'preview' && previewRx.appointmentId !== appointment.id ? ' (previous visit)' : ''}
              </strong>
              <div className="rx-preview-bar-actions">
                <button
                  type="button"
                  className="rx-btn rx-btn-outline"
                  onClick={() => previewFrameRef.current?.contentWindow?.print()}
                >
                  Print
                </button>
                <button type="button" className="rx-btn rx-btn-ghost" onClick={() => setPreviewRx(null)}>
                  Close
                </button>
              </div>
            </div>
            <iframe
              ref={previewFrameRef}
              title="Prescription preview"
              className="rx-preview-frame"
              srcDoc={renderPrescriptionHtml(previewRx)}
            />
          </div>
        </div>
      )}

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