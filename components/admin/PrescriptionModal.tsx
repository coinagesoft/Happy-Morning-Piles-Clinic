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
  CLINIC_INFO,
  LETTERHEAD_LIMITS,
  type Letterhead,
} from '@/lib/prescriptionTemplate';
import { Medicine } from '@/lib/medicines';
import { useClinicSettings } from '@/lib/useClinicSettings';
import { IconCross, IconPlus, IconTrash, IconMail, IconRefresh, IconFileText, IconPill, IconEdit, IconCopy, IconCheck } from './AdminIcons';

// Fallback potency list, used only when the selected medicine has no potencies saved in the database.
const POTENCIES = ['Q', '3X', '6X', '6C', '12C', '30C', '200C', '1M', '10M'];

// One-click suggestions so the doctor rarely has to type quantity / duration / dose.
const QTY_OPTIONS = ['4 pills', '5 pills', '6 pills', '8 pills', '10 pills', '5 drops', '10 drops', '1 tsp', '1/2 tsp', '1 dram'];
const DURATION_OPTIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '15 days', '1 month', '2 months', 'SOS'];
const DOSE_PRESETS = ['1-0-1', '1-1-1', '1-0-0', '0-1-0', '0-0-1', '1-1-0', '0-1-1'];
const FOOD_OPTIONS: { value: PrescriptionMedicine['timing']; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'before', label: 'Before food' },
  { value: 'after', label: 'After food' },
  { value: 'with', label: 'With food' },
];

interface PrescriptionModalProps {
  appointment: Appointment | null;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  availableMedicines?: Medicine[];
  /** Called after a prescription is saved (e.g. to refresh follow-up dates elsewhere). */
  onSaved?: () => void;
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

/** YYYY-MM-DD + n days (calendar arithmetic, no timezone drift). */
function addDaysIso(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
function daysBetweenIso(from: string, to: string): number {
  const f = from.split('-').map(Number);
  const t = to.split('-').map(Number);
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / 86_400_000);
}

/** 2026-11-05 -> "Thu, 5 Nov 2026" */
function formatFollowUpDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Text printed on the prescription: "After 2 weeks (Thu, 5 Nov 2026)". */
function followUpText(rxDate: string, followUpDate: string): string {
  const days = daysBetweenIso(rxDate, followUpDate);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const label =
    days >= 30 && days % 30 === 0
      ? plural(days / 30, 'month')
      : days >= 7 && days % 7 === 0
        ? plural(days / 7, 'week')
        : plural(days, 'day');
  return `After ${label} (${formatFollowUpDate(followUpDate)})`;
}

const FOLLOW_UP_CHIPS: { label: string; days: number }[] = [
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '3 weeks', days: 21 },
  { label: '1 month', days: 30 },
];

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
  /** Called when Enter is pressed and no suggestion is highlighted. Receives the best matching suggestion (if the typed text is only partial). */
  onEnter?: (bestMatch?: string) => void;
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
        const best = showList && q && filtered.length > 0 && filtered[0].toLowerCase() !== q ? filtered[0] : undefined;
        onEnter(best);
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
  onSaved,
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
  const doseTouchedRef = useRef(false); // has a key been pressed in the dose box since it got focus?
  const doseBufRef = useRef(''); // digits typed so far (1 0 1)
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<string | null>(null);
  // Row highlight after add/update, and the last removed medicine (for Undo)
  const [showTips, setShowTips] = useState(false);
  // Letterhead (name / address / phone printed on the PDF) - editable by the doctor
  const [letterhead, setLetterhead] = useState<Letterhead>({ ...CLINIC_INFO });
  const [lhCustomised, setLhCustomised] = useState(false);
  const [lhDraft, setLhDraft] = useState<Letterhead | null>(null);
  const [lhBusy, setLhBusy] = useState<'save' | 'reset' | null>(null);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [removed, setRemoved] = useState<{ med: PrescriptionMedicine; index: number } | null>(null);
  const removedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  // Days after the prescription date (null = date picked by hand). Keeps the date in step with the prescription date.
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const { isClosedOn } = useClinicSettings();
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
    setRemoved(null);
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
          setFollowUpDate(rx.followUpDate || '');
          setFollowUpDays(rx.followUpDate ? daysBetweenIso(rx.date, rx.followUpDate) : null);
        } else {
          setDate(todayIst());
          setDiagnosis(appointment.reason || '');
          setMedicines([]);
          setAdvice('');
          setFollowUp('');
          setFollowUpDate('');
          setFollowUpDays(null);
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

  // Load the saved letterhead once the panel is opened
  const hasAppointment = !!appointment;
  useEffect(() => {
    if (!hasAppointment) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch('/api/admin/prescriptions/letterhead');
        const data = await res.json();
        if (cancelled || !res.ok) return;
        if (data.letterhead) setLetterhead(data.letterhead);
        setLhCustomised(!!data.customised);
      } catch {
        // keep the built-in default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAppointment, adminFetch]);

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

  /** Clears the entry form but keeps the fields that are usually the same for the next medicine. */
  const resetEntryKeepingCommon = (base: PrescriptionMedicine = entry) => {
    setEntry({
      ...emptyMedicine(),
      quantity: base.quantity,
      morning: base.morning,
      afternoon: base.afternoon,
      night: base.night,
      timing: base.timing,
      duration: base.duration,
    });
    setScheduleDraft(null);
    setEditIndex(null);
  };

  /** The medicine list including whatever is typed in the form but not yet added. */
  const listWithPending = (base: PrescriptionMedicine = entry): PrescriptionMedicine[] => {
    if (!base.name.trim()) return medicines;
    return editIndex === null ? [...medicines, { ...base }] : medicines.map((m, i) => (i === editIndex ? { ...base } : m));
  };

  /** Adds the entry to the table (or updates the row being edited). */
  const submitEntry = (override?: Partial<PrescriptionMedicine>) => {
    const base: PrescriptionMedicine = { ...entry, ...(override || {}) };
    // Medicine picked by Enter (best match): fill its first saved potency like Tab does
    if (override?.name && !base.potency) {
      const matched = (availableMedicines || []).find((am) => am.name.trim().toLowerCase() === override.name!.trim().toLowerCase());
      const first = matched?.potency?.split(',')[0].trim();
      if (first) base.potency = first;
    }
    if (!base.name.trim()) {
      toast.error('Enter the medicine name first.');
      nameInputRef.current?.focus();
      return;
    }
    const next = listWithPending(base);
    const idx = editIndex === null ? next.length - 1 : editIndex;
    setMedicines(next);
    resetEntryKeepingCommon(base);
    setDirty(true);
    setFlashIndex(idx);
    setTimeout(() => setFlashIndex((cur) => (cur === idx ? null : cur)), 1600);
    setTimeout(() => nameInputRef.current?.focus(), 30);
  };

  /** Keyboard shortcuts: Enter adds the medicine, Ctrl+Enter saves, Alt+P previews, Esc cancels an edit. */
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
    if (e.key === 'Escape' && editIndex !== null && target.closest('.rx2-entry')) {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit();
      return;
    }
    if (e.key === 'Enter' && target.closest('.rx2-entry') && target.tagName !== 'BUTTON') {
      e.preventDefault();
      submitEntry();
    }
  };

  const cycleDose = (dir: 1 | -1 = 1) => {
    const cur = DOSE_PRESETS.indexOf(scheduleText(entry));
    const next = cur >= 0 ? (cur + dir + DOSE_PRESETS.length) % DOSE_PRESETS.length : dir > 0 ? 0 : DOSE_PRESETS.length - 1;
    updateEntry(parseSchedule(DOSE_PRESETS[next]));
  };

  /**
   * Dose box, one key each:  B = 1-0-1 (twice a day) · T = 1-1-1 (three times) ·
   * M / A / N = that time only (press more to add: M then N = 1-0-1) · digits 1 0 1 also work ·
   * arrows cycle the common doses · Enter adds the medicine.
   */
  const handleDoseKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const slots: Record<string, 'morning' | 'afternoon' | 'night'> = { m: 'morning', a: 'afternoon', n: 'night' };
    if (k === 'b' || k === 't') {
      e.preventDefault();
      updateEntry(parseSchedule(k === 'b' ? '101' : '111'));
      doseTouchedRef.current = true;
      doseBufRef.current = '';
    } else if (slots[k]) {
      e.preventDefault();
      const key = slots[k];
      updateEntry(
        doseTouchedRef.current
          ? { [key]: true }
          : { morning: false, afternoon: false, night: false, [key]: true }
      );
      doseTouchedRef.current = true;
      doseBufRef.current = '';
    } else if (k === '0' || k === '1') {
      e.preventDefault();
      doseBufRef.current = (doseBufRef.current.length >= 3 ? '' : doseBufRef.current) + k;
      updateEntry(parseSchedule(doseBufRef.current));
      doseTouchedRef.current = true;
    } else if (k === 'arrowright' || k === 'arrowdown' || k === ' ') {
      e.preventDefault();
      cycleDose(1);
    } else if (k === 'arrowleft' || k === 'arrowup') {
      e.preventDefault();
      cycleDose(-1);
    } else if (k === 'enter') {
      e.preventDefault();
      e.stopPropagation();
      submitEntry();
    }
  };

  const cycleFood = (dir: 1 | -1 = 1) => {
    const i = FOOD_OPTIONS.findIndex((o) => o.value === entry.timing);
    const next = FOOD_OPTIONS[(i + dir + FOOD_OPTIONS.length) % FOOD_OPTIONS.length];
    updateEntry({ timing: next.value });
  };

  /** Food field is keyboard-first: A = after, B = before, W = with, T = any time, arrows cycle, Enter adds. */
  const handleFoodKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key.toLowerCase();
    const direct: Record<string, PrescriptionMedicine['timing']> = { a: 'after', b: 'before', w: 'with', t: 'any' };
    if (direct[k]) {
      e.preventDefault();
      updateEntry({ timing: direct[k] });
    } else if (k === 'arrowright' || k === 'arrowdown') {
      e.preventDefault();
      cycleFood(1);
    } else if (k === 'arrowleft' || k === 'arrowup') {
      e.preventDefault();
      cycleFood(-1);
    } else if (k === 'enter') {
      e.preventDefault();
      e.stopPropagation();
      submitEntry();
    }
  };

  const editMed = (index: number) => {
    setEntry({ ...medicines[index] });
    setScheduleDraft(null);
    setEditIndex(index);
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 30);
  };

  const cancelEdit = () => {
    setEntry(emptyMedicine());
    setScheduleDraft(null);
    setEditIndex(null);
    setTimeout(() => nameInputRef.current?.focus(), 30);
  };

  /** Removes a row straight away; an Undo bar brings it back for a few seconds. */
  const removeMed = (index: number) => {
    const med = medicines[index];
    if (!med) return;
    setMedicines((prev) => prev.filter((_, i) => i !== index));
    if (editIndex !== null) {
      if (editIndex === index) cancelEdit();
      else if (editIndex > index) setEditIndex(editIndex - 1);
    }
    setRemoved({ med, index });
    if (removedTimerRef.current) clearTimeout(removedTimerRef.current);
    removedTimerRef.current = setTimeout(() => setRemoved(null), 8000);
    setDirty(true);
  };

  const undoRemove = () => {
    if (!removed) return;
    const { med, index } = removed;
    setMedicines((prev) => {
      const copy = [...prev];
      copy.splice(Math.min(index, copy.length), 0, med);
      return copy;
    });
    if (editIndex !== null && editIndex >= index) setEditIndex(editIndex + 1);
    setRemoved(null);
    if (removedTimerRef.current) clearTimeout(removedTimerRef.current);
    setDirty(true);
    setFlashIndex(index);
    setTimeout(() => setFlashIndex((cur) => (cur === index ? null : cur)), 1600);
  };

  /** Copies a row right below itself and opens it for editing (same medicine, different potency etc.). */
  const duplicateMed = (index: number) => {
    const copy = { ...medicines[index] };
    setMedicines((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setEntry(copy);
    setEditIndex(index + 1);
    setScheduleDraft(null);
    setDirty(true);
    setTimeout(() => nameInputRef.current?.focus(), 30);
  };

  const openLetterheadEditor = () => setLhDraft({ ...letterhead });

  const saveLetterheadDraft = async () => {
    if (!lhDraft) return;
    if (!lhDraft.doctorName.trim() || !lhDraft.clinicName.trim()) {
      toast.error('Doctor name and clinic name are required.');
      return;
    }
    setLhBusy('save');
    try {
      const res = await adminFetch('/api/admin/prescriptions/letterhead', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterhead: lhDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save letterhead');
      setLetterhead(data.letterhead);
      setLhCustomised(true);
      setLhDraft(null);
      toast.success('Letterhead saved. New PDFs, emails and WhatsApp copies will use it.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save letterhead');
    } finally {
      setLhBusy(null);
    }
  };

  const resetLetterhead = async () => {
    if (!window.confirm('Go back to the original clinic details?')) return;
    setLhBusy('reset');
    try {
      const res = await adminFetch('/api/admin/prescriptions/letterhead', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset letterhead');
      setLetterhead(data.letterhead);
      setLhCustomised(false);
      setLhDraft(null);
      toast.success('Letterhead reset to the original details.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset letterhead');
    } finally {
      setLhBusy(null);
    }
  };

  const hasMedicine = listWithPending().some((m) => m.name.trim());

  // ---- follow-up: calculated from the prescription date ----
  const applyFollowUpDate = (next: string, days: number | null) => {
    setFollowUpDate(next);
    setFollowUpDays(days);
    setFollowUp(next ? followUpText(date, next) : '');
    setDirty(true);
  };

  const pickFollowUpDays = (days: number) => {
    if (!date) return;
    applyFollowUpDate(addDaysIso(date, days), days);
  };

  const handleRxDateChange = (nextDate: string) => {
    setDate(nextDate);
    setDirty(true);
    // Keep the same gap (e.g. "2 weeks") when the prescription date moves
    if (followUpDate && followUpDays !== null && nextDate) {
      const moved = addDaysIso(nextDate, followUpDays);
      setFollowUpDate(moved);
      setFollowUp(followUpText(nextDate, moved));
    }
  };

  const clearFollowUp = () => {
    applyFollowUpDate('', null);
  };

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
    medicines: listWithPending().filter((m) => m.name.trim()),
    advice,
    followUp,
    followUpDate,
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
    // A medicine typed but not yet added is added automatically - no extra click needed.
    const finalMeds = listWithPending().filter((m) => m.name.trim());
    if (finalMeds.length === 0) {
      toast.error('Add at least one medicine first.');
      nameInputRef.current?.focus();
      return null;
    }
    if (entry.name.trim()) {
      setMedicines(finalMeds);
      resetEntryKeepingCommon();
    }
    try {
      const res = await adminFetch('/api/admin/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.id, date, diagnosis, medicines: finalMeds, advice, followUp, followUpDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save prescription');
      setPrescription(data.prescription);
      onSaved?.();
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
      <aside className="admin-drawer-panel admin-drawer-panel-rx rx2" onClick={(e) => e.stopPropagation()}>
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
          <div className="rx2-head-actions">
            <button
              type="button"
              className="rx2-lh-btn"
              onClick={openLetterheadEditor}
              title="Change the doctor / clinic name, address and phone printed on the prescription PDF"
            >
              <IconEdit size={14} /> Edit letterhead
            </button>
            <button type="button" className="btn-drawer-close" onClick={handleClose} aria-label="Close prescription panel">
              <IconCross />
            </button>
          </div>
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
                <input type="date" value={date} onChange={(e) => handleRxDateChange(e.target.value)} />
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

            {/* ---------------- ADD / EDIT MEDICINE ---------------- */}
            <section className={`rx2-entry ${editIndex !== null ? 'is-editing' : ''}`} aria-label="Add medicine">
              <div className="rx2-entry-head">
                <h4>{editIndex === null ? 'Add medicine' : `Editing medicine #${editIndex + 1}`}</h4>
                <div className="rx2-head-right">
                  {editIndex !== null && <span className="rx2-edit-pill">Editing — press Update, or Esc to cancel</span>}
                  <button
                    type="button"
                    className={`rx2-tips-btn ${showTips ? 'on' : ''}`}
                    tabIndex={-1}
                    aria-expanded={showTips}
                    onClick={() => setShowTips((v) => !v)}
                    title="Show / hide keyboard tips"
                  >
                    <span aria-hidden="true">?</span> Tips
                  </button>
                </div>
              </div>

              <div className="rx2-grid">
                <label className="rx-field rx2-name">
                  <span>Medicine</span>
                  <SuggestInput
                    className="rx-input"
                    placeholder="Type name, then Enter to add"
                    options={remedyOptions}
                    value={entry.name}
                    onChange={(v) => updateEntry({ name: v })}
                    inputRef={nameInputRef}
                    onEnter={(best) => submitEntry(best ? { name: best } : undefined)}
                  />
                </label>
                <label className="rx-field rx2-potency">
                  <span>Potency</span>
                  <SuggestInput
                    className="rx-input"
                    placeholder="e.g. 30C"
                    options={potencyOptionsFor(entry.name)}
                    value={entry.potency}
                    onChange={(v) => updateEntry({ potency: v })}
                    onEnter={(best) => submitEntry(best ? { potency: best } : undefined)}
                  />
                </label>
                <label className="rx-field rx2-qty">
                  <span>Quantity</span>
                  <SuggestInput
                    className="rx-input"
                    placeholder="e.g. 4 pills"
                    options={QTY_OPTIONS}
                    value={entry.quantity}
                    onChange={(v) => updateEntry({ quantity: v })}
                    onEnter={(best) => submitEntry(best ? { quantity: best } : undefined)}
                  />
                </label>
                <div className="rx-field rx2-dose">
                  <span>
                    Dose <em>B · T · M · A · N</em>
                  </span>
                  <div
                    className="rx2-dose-box"
                    tabIndex={0}
                    role="group"
                    aria-label="Dose: morning, afternoon, night"
                    title="B = 1-0-1 · T = 1-1-1 · M / A / N = morning / afternoon / night · or type 1 0 1 · arrows cycle common doses"
                    onFocus={() => {
                      doseTouchedRef.current = false;
                      doseBufRef.current = '';
                    }}
                    onKeyDown={handleDoseKey}
                  >
                    <span className="rx2-dose-big">{scheduleText(entry)}</span>
                    <span className="rx2-slots">
                      {(
                        [
                          ['morning', 'M', 'Morning'],
                          ['afternoon', 'A', 'Afternoon'],
                          ['night', 'N', 'Night'],
                        ] as const
                      ).map(([key, letter, label]) => (
                        <button
                          type="button"
                          key={key}
                          tabIndex={-1}
                          title={label}
                          aria-pressed={entry[key]}
                          className={`rx2-slot ${entry[key] ? 'on' : ''}`}
                          onClick={() => updateEntry({ [key]: !entry[key] } as Partial<PrescriptionMedicine>)}
                        >
                          {letter}
                        </button>
                      ))}
                    </span>
                  </div>
                </div>
                <div className="rx-field rx2-food">
                  <span>
                    Food <em>A · B · W</em>
                  </span>
                  <button
                    type="button"
                    className="rx2-food-btn"
                    onClick={() => cycleFood(1)}
                    onKeyDown={handleFoodKey}
                    title="Press A = after food, B = before food, W = with food, T = any time"
                  >
                    {FOOD_OPTIONS.find((o) => o.value === entry.timing)?.label}
                  </button>
                </div>

                <label className="rx-field rx2-duration">
                  <span>Duration</span>
                  <SuggestInput
                    className="rx-input"
                    placeholder="e.g. 7 days"
                    options={DURATION_OPTIONS}
                    value={entry.duration}
                    onChange={(v) => updateEntry({ duration: v })}
                    onEnter={(best) => submitEntry(best ? { duration: best } : undefined)}
                  />
                </label>
                <label className="rx-field rx2-note">
                  <span>Special instructions (optional)</span>
                  <input
                    type="text"
                    placeholder="e.g. Dissolve under the tongue, avoid mint/coffee 30 min before"
                    value={entry.instructions}
                    onChange={(e) => updateEntry({ instructions: e.target.value })}
                  />
                </label>
                <div className="rx2-actions">
                  {editIndex !== null && (
                    <button type="button" className="rx-btn rx-btn-ghost" tabIndex={-1} onClick={cancelEdit}>
                      Cancel
                    </button>
                  )}
                  <button type="button" className="rx2-add-btn" onClick={() => submitEntry()}>
                    {editIndex === null ? <IconPlus /> : <IconCheck size={15} />}
                    {editIndex === null ? 'Add' : 'Update'}
                  </button>
                </div>
              </div>

              {showTips && (
              <p className="rx2-shortcuts">
                <strong>Fast flow:</strong> type medicine → <kbd>Enter</kbd> adds it (best match is picked; potency, qty, dose, food and duration repeat from the last one).
                Change only what differs with <kbd>Tab</kbd>: dose <kbd>B</kbd> = 1-0-1 · <kbd>T</kbd> = 1-1-1 · <kbd>M</kbd>/<kbd>A</kbd>/<kbd>N</kbd> (or type 101) · food <kbd>A</kbd>/<kbd>B</kbd>/<kbd>W</kbd> · <kbd>Enter</kbd> adds ·{' '}
                <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save · <kbd>Alt</kbd>+<kbd>P</kbd> preview
              </p>
              )}
            </section>

            {/* ---------------- PRESCRIBED LIST ---------------- */}
            <section aria-label="Prescribed medicines">
              <div className="rx2-list-head">
                <h4>
                  Prescribed medicines <span className="rx2-count">{medicines.length}</span>
                </h4>
                {removed && (
                  <div className="rx2-undo" role="status">
                    <span>
                      Removed <strong>{removed.med.name || 'medicine'}</strong>
                    </span>
                    <button type="button" onClick={undoRemove}>
                      Undo
                    </button>
                  </div>
                )}
              </div>

              {medicines.length === 0 ? (
                <p className="rx2-empty">No medicines yet. Type a name above and press Enter to add it.</p>
              ) : (
                <div className="rx2-table-wrap" ref={tableWrapRef}>
                  <table className="rx2-table">
                    <colgroup>
                      <col style={{ width: 44 }} />
                      <col />
                      <col style={{ width: 104 }} />
                      <col style={{ width: 196 }} />
                      <col style={{ width: 104 }} />
                      <col style={{ width: 104 }} />
                      <col style={{ width: 150 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Medicine</th>
                        <th>Qty</th>
                        <th>Dose</th>
                        <th>Food</th>
                        <th>Duration</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {medicines.map((m, i) => (
                        <tr
                          key={i}
                          className={`${editIndex === i ? 'is-editing' : ''} ${flashIndex === i ? 'is-flash' : ''}`}
                          onDoubleClick={() => editMed(i)}
                        >
                          <td className="rx2-num">{i + 1}</td>
                          <td>
                            <div className="rx2-med-line">
                              <strong>{m.name}</strong>
                              {m.potency ? <span className="rx2-potency-tag">{m.potency}</span> : null}
                            </div>
                            {m.instructions ? <div className="rx2-sub">{m.instructions}</div> : null}
                          </td>
                          <td>{m.quantity || <span className="rx2-dash">—</span>}</td>
                          <td>
                            <span className="rx2-dose-code">{scheduleText(m)}</span>
                            <div className="rx2-sub rx2-nowrap">{describeSchedule(m)}</div>
                          </td>
                          <td className="rx2-food-cell">{describeTiming(m.timing) || <span className="rx2-dash">Any time</span>}</td>
                          <td>{m.duration || <span className="rx2-dash">—</span>}</td>
                          <td>
                            <div className="rx2-row-actions">
                              <button type="button" className="rx2-icon-btn rx2-edit" onClick={() => editMed(i)} title="Edit (or double-click the row)">
                                <IconEdit size={14} /> Edit
                              </button>
                              <button type="button" className="rx2-icon-btn" onClick={() => duplicateMed(i)} title="Duplicate this medicine" aria-label="Duplicate">
                                <IconCopy size={14} />
                              </button>
                              <button type="button" className="rx2-icon-btn rx2-del" onClick={() => removeMed(i)} title="Remove" aria-label="Remove medicine">
                                <IconTrash size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---------------- ADVICE / FOLLOW-UP / EMAIL ---------------- */}
            <section className="rx2-bottom" aria-label="Advice and follow-up">
              <style>{`
                .rx2-followup { gap: 8px; }
                .rx2-followup .fu-chips { display: flex; flex-wrap: wrap; gap: 6px; }
                .rx2-followup .fu-chip { padding: 5px 12px; border-radius: 999px; border: 1.5px solid var(--line, #e2e8f0); background: #fff; color: var(--ink, #44476A); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
                .rx2-followup .fu-chip:hover { border-color: var(--primary, #565ACF); color: var(--primary, #565ACF); }
                .rx2-followup .fu-chip.active { background: var(--primary, #565ACF); border-color: var(--primary, #565ACF); color: #fff; }
                .rx2-followup .fu-date-row { display: flex; gap: 8px; align-items: center; }
                .rx2-followup .fu-date-row input { flex: 1; min-width: 0; }
                .rx2-followup .fu-clear { border: none; background: #fef2f2; color: #b91c1c; font-weight: 700; font-size: 12.5px; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-family: inherit; }
                .rx2-followup .fu-note { font-size: 12.5px; line-height: 1.5; color: #475569; background: #f5f6ff; border: 1px solid #dde1f8; border-radius: 10px; padding: 8px 12px; }
                .rx2-followup .fu-warn { color: #b45309; font-weight: 700; }
              `}</style>
              <label className="rx-field rx2-advice">
                <span>Advice / Diet</span>
                <textarea
                  rows={2}
                  value={advice}
                  placeholder="Diet, lifestyle, things to avoid…"
                  onChange={(e) => { setAdvice(e.target.value); setDirty(true); }}
                />
              </label>
              <div className="rx-field rx2-followup">
                <span>Follow-up</span>
                <div className="fu-chips" role="group" aria-label="Follow-up after">
                  {FOLLOW_UP_CHIPS.map((c) => (
                    <button
                      key={c.days}
                      type="button"
                      className={`fu-chip ${followUpDays === c.days && followUpDate ? 'active' : ''}`}
                      onClick={() => pickFollowUpDays(c.days)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="fu-date-row">
                  <input
                    type="date"
                    value={followUpDate}
                    min={date ? addDaysIso(date, 1) : undefined}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return clearFollowUp();
                      applyFollowUpDate(v, date ? daysBetweenIso(date, v) : null);
                    }}
                    aria-label="Follow-up date"
                  />
                  {followUpDate && (
                    <button type="button" className="fu-clear" onClick={clearFollowUp}>
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={followUp}
                  placeholder="Printed on the prescription, e.g. After 2 weeks"
                  onChange={(e) => { setFollowUp(e.target.value); setDirty(true); }}
                  aria-label="Follow-up text on the prescription"
                />
                {followUpDate && (
                  <div className="fu-note">
                    <strong>{formatFollowUpDate(followUpDate)}</strong>
                    {' '}&middot; the patient gets an email reminder on{' '}
                    {addDaysIso(followUpDate, -1) > date ? `${formatFollowUpDate(addDaysIso(followUpDate, -1))} and ` : ''}
                    the day itself.
                    {isClosedOn(followUpDate) && (
                      <span className="fu-warn"> The clinic has no sitting on this weekday.</span>
                    )}
                  </div>
                )}
              </div>
              <label className="rx-field">
                <span>
                  <IconMail size={13} /> Patient email (for PDF)
                </span>
                <input type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="patient@email.com" />
              </label>
            </section>
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
            <button type="button" className="rx-btn rx-btn-save" onClick={handleSave} disabled={busy !== null || loading}>
              <IconCheck size={14} /> {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <span className="rx2-footer-sep" aria-hidden="true" />
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
                <button type="button" className="rx-btn rx-btn-outline" onClick={openLetterheadEditor}>
                  <IconEdit size={14} /> Edit letterhead
                </button>
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
              srcDoc={renderPrescriptionHtml(previewRx, letterhead)}
            />
          </div>
        </div>
      )}

      {lhDraft && (
        <div className="rx2-lh-overlay" onClick={() => setLhDraft(null)} role="dialog" aria-modal="true" aria-label="Edit prescription letterhead">
          <div className="rx2-lh" onClick={(e) => e.stopPropagation()}>
            <div className="rx2-lh-head">
              <div>
                <h3>Prescription letterhead</h3>
                <p>
                  The name, address and phone printed at the top and bottom of every prescription PDF, email and WhatsApp copy.
                  {lhCustomised ? ' (Customised)' : ' (Original details)'}
                </p>
              </div>
              <button type="button" className="btn-drawer-close" onClick={() => setLhDraft(null)} aria-label="Close">
                <IconCross />
              </button>
            </div>

            {/* live preview of the PDF header */}
            <div className="rx2-lh-preview" aria-label="Letterhead preview">
              <div className="rx2-lh-prev-left">
                <div className="rx2-lh-prev-name">{lhDraft.doctorName || 'Doctor name'}</div>
                {lhDraft.qualification && <div className="rx2-lh-prev-small">{lhDraft.qualification}</div>}
                {lhDraft.regNo && <div className="rx2-lh-prev-small">Reg. No.: {lhDraft.regNo}</div>}
              </div>
              <div className="rx2-lh-prev-right">
                <strong>{lhDraft.clinicName || 'Clinic name'}</strong>
                {lhDraft.address && <div style={{ whiteSpace: 'pre-line' }}>{lhDraft.address}</div>}
                {lhDraft.phone && <div>Phone: {lhDraft.phone}</div>}
              </div>
            </div>

            <div className="rx2-lh-form">
              <label className="rx-field">
                <span>Doctor name</span>
                <input
                  type="text"
                  maxLength={LETTERHEAD_LIMITS.doctorName}
                  value={lhDraft.doctorName}
                  onChange={(e) => setLhDraft({ ...lhDraft, doctorName: e.target.value })}
                  placeholder="e.g. Dr. Mahesh Shete"
                  autoFocus
                />
              </label>
              <label className="rx-field">
                <span>Qualification / speciality</span>
                <input
                  type="text"
                  maxLength={LETTERHEAD_LIMITS.qualification}
                  value={lhDraft.qualification}
                  onChange={(e) => setLhDraft({ ...lhDraft, qualification: e.target.value })}
                  placeholder="e.g. BAMS | Piles & Fistula Specialist"
                />
              </label>
              <label className="rx-field">
                <span>Registration no. (optional)</span>
                <input
                  type="text"
                  maxLength={LETTERHEAD_LIMITS.regNo}
                  value={lhDraft.regNo}
                  onChange={(e) => setLhDraft({ ...lhDraft, regNo: e.target.value })}
                  placeholder="e.g. 2015/03/1234"
                />
              </label>
              <label className="rx-field">
                <span>Clinic name</span>
                <input
                  type="text"
                  maxLength={LETTERHEAD_LIMITS.clinicName}
                  value={lhDraft.clinicName}
                  onChange={(e) => setLhDraft({ ...lhDraft, clinicName: e.target.value })}
                  placeholder="e.g. Happy Morning Piles Clinic"
                />
              </label>
              <label className="rx-field rx2-lh-wide">
                <span>Address</span>
                <textarea
                  rows={3}
                  maxLength={LETTERHEAD_LIMITS.address}
                  value={lhDraft.address}
                  onChange={(e) => setLhDraft({ ...lhDraft, address: e.target.value })}
                  placeholder="Clinic address (you can use more than one line)"
                />
              </label>
              <label className="rx-field">
                <span>Phone</span>
                <input
                  type="text"
                  maxLength={LETTERHEAD_LIMITS.phone}
                  value={lhDraft.phone}
                  onChange={(e) => setLhDraft({ ...lhDraft, phone: e.target.value })}
                  placeholder="e.g. +91 70667 47811"
                />
              </label>
            </div>
            <p className="rx2-lh-note">
              Tip: use English letters and numbers only — the PDF cannot print Marathi / Hindi text. Changes also apply when an
              older prescription is downloaded or sent again.
            </p>

            <div className="rx2-lh-foot">
              <button type="button" className="rx-btn rx-btn-ghost" onClick={resetLetterhead} disabled={lhBusy !== null || !lhCustomised}>
                {lhBusy === 'reset' ? 'Resetting…' : 'Reset to original'}
              </button>
              <div className="rx2-lh-foot-right">
                <button type="button" className="rx-btn rx-btn-ghost" onClick={() => setLhDraft(null)} disabled={lhBusy !== null}>
                  Cancel
                </button>
                <button type="button" className="rx-btn rx-btn-primary" onClick={saveLetterheadDraft} disabled={lhBusy !== null}>
                  {lhBusy === 'save' ? 'Saving…' : 'Save letterhead'}
                </button>
              </div>
            </div>
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