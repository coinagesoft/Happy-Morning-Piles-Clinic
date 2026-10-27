import { CLINIC } from './clinicInfo';
import { formatSlotLabel } from './slots';

export interface ReminderAppointment {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  age: number;
  reason: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  meetLink?: string;
  consultationType: 'online' | 'offline';
  createdAt: string;
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 2026-10-23 -> Friday, 23 October 2026 */
export function formatDateLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function modeLabel(a: ReminderAppointment): string {
  return a.consultationType === 'offline'
    ? 'In-clinic visit'
    : 'Online video consultation (Google Meet)';
}

/** Meet link for online visits, clinic address for in-clinic visits. */
export function locationDetail(a: ReminderAppointment): string {
  return a.consultationType === 'offline'
    ? `Clinic address: ${CLINIC.address.full}.`
    : a.meetLink
      ? `Join link: ${a.meetLink}`
      : 'Our team will share the video link with you shortly.';
}

const wrap = (inner: string) => `
<div style="background:#f4f7f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#166534;color:#ffffff;padding:18px 24px">
      <div style="font-size:18px;font-weight:bold">${esc(CLINIC.name)}</div>
      <div style="font-size:12px;opacity:.85">${esc(CLINIC.tagline)}</div>
    </div>
    <div style="padding:24px">${inner}</div>
    <div style="padding:14px 24px;background:#f9fafb;font-size:12px;color:#6b7280">
      ${esc(CLINIC.address.full)}<br/>Phone: ${esc(CLINIC.phone.display)}
    </div>
  </div>
</div>`;

/**
 * @param lead     how many minutes before the appointment this reminder is (2880, 1440, 600, 60, 10 ...)
 * @param dayWord  'today' | 'tomorrow' | 'in 2 days' | 'on <date>' (used for the day-level reminders)
 */
export function patientReminderEmail(a: ReminderAppointment, lead: number, dayWord: string) {
  const time = formatSlotLabel(a.time);
  const dateLong = formatDateLong(a.date);

  let when: string;
  if (lead <= 60) when = lead === 60 ? 'in 1 hour' : `in ${lead} minutes`;
  else if (lead < 1440) when = `in about ${Math.round(lead / 60)} hours`;
  else when = dayWord;

  const subject = `Reminder: your appointment ${when} at ${time} - ${CLINIC.name}`;
  const intro = `This is a friendly reminder about your upcoming appointment ${when}.`;
  const online = a.consultationType !== 'offline';

  const action = online
    ? a.meetLink
      ? `<p style="margin:20px 0"><a href="${esc(a.meetLink)}" style="background:#166534;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Join Google Meet</a></p>`
      : '<p>Our team will share the video link with you shortly.</p>'
    : `<p><strong>Clinic address:</strong><br/>${esc(CLINIC.address.full)}</p>`;

  const html = wrap(`
    <p style="margin:0 0 12px">Hello ${esc(a.fullName)},</p>
    <p style="margin:0 0 16px">${esc(intro)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280;width:120px">Doctor</td><td>${esc(CLINIC.doctor.name)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Date</td><td>${esc(dateLong)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Time</td><td>${esc(time)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Type</td><td>${esc(modeLabel(a))}</td></tr>
    </table>
    ${action}
    <p style="margin:16px 0 0;font-size:13px;color:#4b5563">Need to reschedule? Please call us on ${esc(CLINIC.phone.display)}.</p>
  `);

  const text =
    `Hello ${a.fullName},\n\n${intro}\n\n` +
    `Doctor: ${CLINIC.doctor.name}\nDate: ${dateLong}\nTime: ${time}\nType: ${modeLabel(a)}\n` +
    `${locationDetail(a)}\n\nNeed to reschedule? Call ${CLINIC.phone.display}.\n\n${CLINIC.name}`;

  return { subject, html, text };
}

/** Follow-up visit reminder, from the follow-up date the doctor set on the prescription. */
export function followUpReminderEmail(opts: {
  fullName: string;
  followUpDate: string; // YYYY-MM-DD
  daysBefore: number; // 1 = tomorrow, 0 = today
  bookingUrl?: string;
}) {
  const dateLong = formatDateLong(opts.followUpDate);
  const when =
    opts.daysBefore === 0 ? 'today' : opts.daysBefore === 1 ? 'tomorrow' : `on ${dateLong}`;

  const subject =
    opts.daysBefore === 0
      ? `Follow-up visit due today - ${CLINIC.name}`
      : `Reminder: your follow-up visit is ${when} (${dateLong}) - ${CLINIC.name}`;
  const intro = `This is a gentle reminder that your follow-up visit with ${CLINIC.doctor.name} is due ${when}.`;

  const action = opts.bookingUrl
    ? `<p style="margin:20px 0"><a href="${esc(opts.bookingUrl)}" style="background:#166534;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Book your follow-up slot</a></p>`
    : '';

  const html = wrap(`
    <p style="margin:0 0 12px">Hello ${esc(opts.fullName)},</p>
    <p style="margin:0 0 16px">${esc(intro)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280;width:120px">Doctor</td><td>${esc(CLINIC.doctor.name)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Follow-up date</td><td><strong>${esc(dateLong)}</strong></td></tr>
    </table>
    ${action}
    <p style="margin:16px 0 0;font-size:13px;color:#4b5563">To book or change your visit, please call us on ${esc(CLINIC.phone.display)}. If you have already booked, you can ignore this message.</p>
  `);

  const text =
    `Hello ${opts.fullName},\n\n${intro}\n\n` +
    `Doctor: ${CLINIC.doctor.name}\nFollow-up date: ${dateLong}\n` +
    `${opts.bookingUrl ? `Book your slot: ${opts.bookingUrl}\n` : ''}` +
    `\nTo book or change your visit, call ${CLINIC.phone.display}. If you have already booked, you can ignore this message.\n\n${CLINIC.name}`;

  return { subject, html, text };
}

export function doctorDigestEmail(date: string, list: ReminderAppointment[]) {
  const dateLong = formatDateLong(date);
  const subject =
    list.length === 0
      ? `No appointments today (${dateLong})`
      : `Today's schedule: ${list.length} appointment${list.length > 1 ? 's' : ''} (${dateLong})`;

  const rows = list
    .map(
      (a, i) => `
      <tr style="border-top:1px solid #e5e7eb">
        <td style="padding:8px 6px">${i + 1}</td>
        <td style="padding:8px 6px;white-space:nowrap"><strong>${esc(formatSlotLabel(a.time))}</strong></td>
        <td style="padding:8px 6px">${esc(a.fullName)}<br/><span style="color:#6b7280;font-size:12px">${esc(a.age)} yrs</span></td>
        <td style="padding:8px 6px">${esc(a.phone)}</td>
        <td style="padding:8px 6px">${esc(a.reason)}</td>
        <td style="padding:8px 6px">${a.consultationType === 'offline' ? 'In-clinic' : a.meetLink ? `<a href="${esc(a.meetLink)}">Online (Meet)</a>` : 'Online'}</td>
      </tr>`
    )
    .join('');

  const body =
    list.length === 0
      ? '<p>You have no confirmed appointments today.</p>'
      : `<table style="border-collapse:collapse;width:100%;font-size:13px">
          <tr style="text-align:left;color:#6b7280">
            <th style="padding:6px">#</th><th style="padding:6px">Time</th><th style="padding:6px">Patient</th>
            <th style="padding:6px">Phone</th><th style="padding:6px">Reason</th><th style="padding:6px">Type</th>
          </tr>${rows}
        </table>`;

  const html = wrap(`
    <p style="margin:0 0 6px">Good morning ${esc(CLINIC.doctor.name)},</p>
    <p style="margin:0 0 16px">Here is your schedule for <strong>${esc(dateLong)}</strong>.</p>
    ${body}
  `);

  const text =
    `Good morning ${CLINIC.doctor.name},\n\nSchedule for ${dateLong}:\n\n` +
    (list.length === 0
      ? 'No confirmed appointments today.'
      : list
          .map(
            (a, i) =>
              `${i + 1}. ${formatSlotLabel(a.time)} - ${a.fullName} (${a.age} yrs), ${a.phone}, ${a.reason}, ${a.consultationType === 'offline' ? 'In-clinic' : 'Online'}`
          )
          .join('\n'));

  return { subject, html, text };
}