import { CLINIC } from './clinicInfo';
// Shared (client + server) prescription types and HTML template.
// The SAME HTML is used for on-screen print and for the email body,
// so the printed copy and the emailed copy always look identical.

export interface PrescriptionMedicine {
  name: string;
  potency: string; // e.g. 30C, 200C, Q, 6X
  quantity: string; // e.g. "4 pills", "5 drops", "1 tsp"
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  timing: 'before' | 'after' | 'with' | 'any'; // relative to food
  duration: string; // e.g. "7 days"
  instructions: string;
}

export interface Prescription {
  id: string;
  appointmentId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientAge: number;
  date: string; // YYYY-MM-DD (prescription date)
  diagnosis: string;
  medicines: PrescriptionMedicine[];
  advice: string;
  followUp: string; // free text or date
  emailedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Clinic letterhead ----
// These are only the DEFAULTS. The doctor can change them any time from the prescription panel
// ("Edit letterhead"); the saved version is stored in the database and used for the PDF, email and WhatsApp copy.
export interface Letterhead {
  doctorName: string;
  qualification: string; // e.g. "BAMS | Piles & Fistula Specialist"
  clinicName: string;
  address: string; // may contain line breaks
  phone: string;
  regNo: string; // optional registration number, printed under the qualification
}

export const CLINIC_INFO: Letterhead = {
  doctorName: CLINIC.doctor.name,
  qualification: CLINIC.doctor.title,
  clinicName: CLINIC.name,
  address: CLINIC.address.full,
  phone: CLINIC.phone.display,
  regNo: '',
};

export const LETTERHEAD_LIMITS: Record<keyof Letterhead, number> = {
  doctorName: 80,
  qualification: 200,
  clinicName: 120,
  address: 300,
  phone: 40,
  regNo: 60,
};

/** Merges any partial/untrusted input onto the defaults, trims and caps every field. */
export function normalizeLetterhead(input: unknown): Letterhead {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...CLINIC_INFO };
  (Object.keys(LETTERHEAD_LIMITS) as (keyof Letterhead)[]).forEach((key) => {
    const v = src[key];
    if (typeof v === 'string') {
      out[key] = v.replace(/\r/g, '').trim().slice(0, LETTERHEAD_LIMITS[key]);
    }
  });
  return out;
}

export function emptyMedicine(): PrescriptionMedicine {
  return {
    name: '',
    potency: '',
    quantity: '',
    morning: true,
    afternoon: false,
    night: true,
    timing: 'any',
    duration: '',
    instructions: '',
  };
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br/>');
}

export function formatRxDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function describeSchedule(m: PrescriptionMedicine): string {
  const parts: string[] = [];
  if (m.morning) parts.push('Morning');
  if (m.afternoon) parts.push('Afternoon');
  if (m.night) parts.push('Night');
  return parts.length ? parts.join(' • ') : '—';
}

export function describeTiming(t: PrescriptionMedicine['timing']): string {
  if (t === 'before') return 'Before food';
  if (t === 'after') return 'After food';
  if (t === 'with') return 'With food';
  return '';
}

/** Returns a complete, self-contained HTML document (inline CSS, table layout). */
export function renderPrescriptionHtml(rx: Prescription, lh: Letterhead = CLINIC_INFO): string {
  const meds = rx.medicines.filter((m) => m.name.trim());

  const rows = meds
    .map((m, i) => {
      const nameLine = `<strong style="font-size:14px;color:#111827;">${escapeHtml(m.name)}</strong>${
        m.potency ? ` <span style="color:#4338ca;font-weight:600;">${escapeHtml(m.potency)}</span>` : ''
      }`;
      const timing = describeTiming(m.timing);
      const note = m.instructions
        ? `<div style="margin-top:3px;font-size:11.5px;color:#6b7280;">${escapeHtml(m.instructions)}</div>`
        : '';
      return `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#6b7280;">${i + 1}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${nameLine}${note}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(m.quantity) || '—'}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(describeSchedule(m))}${
        timing ? `<div style="font-size:11.5px;color:#6b7280;">${timing}</div>` : ''
      }</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(m.duration) || '—'}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Prescription - ${escapeHtml(rx.patientName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { margin:0; padding:0; background:#ffffff; font-family: Arial, Helvetica, sans-serif; color:#1f2937; font-size:13px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
<div style="max-width:760px;margin:0 auto;padding:8px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid #565acf;padding-bottom:10px;">
    <tr>
      <td style="vertical-align:top;">
        <div style="font-size:22px;font-weight:700;color:#3730a3;">${escapeHtml(lh.doctorName)}</div>
        <div style="font-size:11.5px;color:#4b5563;margin-top:3px;letter-spacing:0.3px;">${escapeHtml(lh.qualification)}</div>${
          lh.regNo ? `<div style="font-size:11.5px;color:#4b5563;margin-top:2px;">Reg. No.: ${escapeHtml(lh.regNo)}</div>` : ''
        }
        <div style="font-size:12px;color:#ea580c;font-weight:600;margin-top:2px;">${escapeHtml(lh.clinicName)}</div>
      </td>
      <td style="vertical-align:top;text-align:right;font-size:12px;color:#4b5563;line-height:1.5;">
        ${nl2br(lh.address)}${lh.phone ? `<br/>Phone: ${escapeHtml(lh.phone)}` : ''}
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:#f5f6ff;border:1px solid #dfe2fb;border-radius:8px;">
    <tr>
      <td style="padding:10px 12px;"><span style="color:#6b7280;">Patient</span><br/><strong style="font-size:14px;">${escapeHtml(rx.patientName)}</strong></td>
      <td style="padding:10px 12px;"><span style="color:#6b7280;">Age</span><br/><strong>${rx.patientAge ? escapeHtml(String(rx.patientAge)) + ' yrs' : '—'}</strong></td>
      <td style="padding:10px 12px;"><span style="color:#6b7280;">Phone</span><br/><strong>${escapeHtml(rx.patientPhone) || '—'}</strong></td>
      <td style="padding:10px 12px;text-align:right;"><span style="color:#6b7280;">Date</span><br/><strong>${escapeHtml(formatRxDate(rx.date))}</strong></td>
    </tr>
  </table>

  ${
    rx.diagnosis.trim()
      ? `<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Complaints / Diagnosis</div><div style="margin-top:4px;font-size:13.5px;">${nl2br(rx.diagnosis)}</div></div>`
      : ''
  }

  <div style="margin-top:16px;font-size:26px;font-weight:700;color:#3730a3;font-family:Georgia,serif;">&#8478;</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:2px;">
    <thead>
      <tr style="background:#eef0ff;">
        <th align="left" style="padding:8px;font-size:11px;text-transform:uppercase;color:#4b5563;width:28px;">#</th>
        <th align="left" style="padding:8px;font-size:11px;text-transform:uppercase;color:#4b5563;">Medicine</th>
        <th align="left" style="padding:8px;font-size:11px;text-transform:uppercase;color:#4b5563;">Quantity</th>
        <th align="left" style="padding:8px;font-size:11px;text-transform:uppercase;color:#4b5563;">When to take</th>
        <th align="left" style="padding:8px;font-size:11px;text-transform:uppercase;color:#4b5563;">Duration</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5" style="padding:14px;color:#6b7280;">No medicines added.</td></tr>'}</tbody>
  </table>

  ${
    rx.advice.trim()
      ? `<div style="margin-top:18px;"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Advice / Diet</div><div style="margin-top:4px;font-size:13px;line-height:1.55;">${nl2br(rx.advice)}</div></div>`
      : ''
  }
  ${
    rx.followUp.trim()
      ? `<div style="margin-top:14px;"><span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Follow-up:</span> <strong>${escapeHtml(rx.followUp)}</strong></div>`
      : ''
  }

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:44px;">
    <tr>
      <td style="font-size:11px;color:#9ca3af;vertical-align:bottom;">This prescription was issued by ${escapeHtml(lh.clinicName)}.<br/>Take medicines only as directed.</td>
      <td style="text-align:right;vertical-align:bottom;">
        <div style="display:inline-block;border-top:1px solid #9ca3af;padding-top:4px;min-width:170px;text-align:center;font-size:12px;color:#374151;">${escapeHtml(lh.doctorName)}</div>
      </td>
    </tr>
  </table>
</div>
</body></html>`;
}