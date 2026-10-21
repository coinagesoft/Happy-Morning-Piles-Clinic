import { google } from 'googleapis';
import { CLINIC } from './clinicInfo';
import { getCachedSlotDuration } from './clinicSettings';
import {
  getGoogleTokens,
  saveGoogleTokens,
  getGoogleConfig,
  Appointment,
} from './storage';

export const DOCTOR_EMAIL = process.env.DOCTOR_EMAIL || 'shivrajrbabar@gmail.com';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
];

export function getOAuth2Client(customRedirectUri?: string) {
  const config = getGoogleConfig();
  let defaultAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!defaultAppUrl) {
    defaultAppUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  }
  const redirectUri = customRedirectUri || `${defaultAppUrl}/api/auth/google/callback`;

  if (!config?.clientId || !config?.clientSecret) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    redirectUri
  );

  // Set tokens if available
  const tokens = getGoogleTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);

    // Save refreshed tokens automatically
    oauth2Client.on('tokens', (newTokens) => {
      saveGoogleTokens(newTokens);
    });
  }

  return oauth2Client;
}

export function getGoogleAuthUrl(customRedirectUri?: string): string | null {
  const oauth2Client = getOAuth2Client(customRedirectUri);
  if (!oauth2Client) return null;

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Forces refresh token return
    scope: SCOPES,
    login_hint: DOCTOR_EMAIL,
  });
}

export async function exchangeCodeForTokens(code: string, customRedirectUri?: string) {
  const oauth2Client = getOAuth2Client(customRedirectUri);
  if (!oauth2Client) {
    throw new Error('Google OAuth credentials not configured in environment.');
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  saveGoogleTokens(tokens);
  return tokens;
}

export function isGoogleConnected(): boolean {
  const tokens = getGoogleTokens();
  return Boolean(tokens && (tokens.refresh_token || tokens.access_token));
}

/**
 * Calculates start and end Date objects in Indian Standard Time (Asia/Kolkata).
 * Default length follows the admin-configured appointment duration.
 */
function getStartAndEndTime(date: string, time: string, durationMinutes = getCachedSlotDuration()) {
  // Format: YYYY-MM-DDTHH:mm:00+05:30
  const startIso = `${date}T${time}:00+05:30`;
  const [hours, minutes] = time.split(':').map(Number);
  
  const endMinutesTotal = minutes + durationMinutes;
  const endHours = hours + Math.floor(endMinutesTotal / 60);
  const endMinutes = endMinutesTotal % 60;

  const endHoursFormatted = String(endHours).padStart(2, '0');
  const endMinutesFormatted = String(endMinutes).padStart(2, '0');
  const endIso = `${date}T${endHoursFormatted}:${endMinutesFormatted}:00+05:30`;

  return { startIso, endIso };
}

export interface CalendarEventResult {
  meetLink: string;
  eventId: string;
}

export async function createCalendarMeeting(
  appointment: Appointment
): Promise<CalendarEventResult> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client || !isGoogleConnected()) {
    throw new Error(
      'Google Calendar is not connected. Please authorize at /api/auth/google first.'
    );
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const { startIso, endIso } = getStartAndEndTime(appointment.date, appointment.time);

  const isOffline = appointment.consultationType === 'offline';

  const summary = isOffline
    ? `[In-Clinic / Offline] Consultation: ${appointment.fullName} - ${CLINIC.name}`
    : `[Online Video] Consultation: ${appointment.fullName} & ${CLINIC.doctor.name}`;

  const location = isOffline
    ? `${CLINIC.name}, ${CLINIC.address.full}`
    : 'Google Meet Video Call';

  const description = isOffline
    ? `IN-CLINIC / OFFLINE CONSULTATION (In-Person Clinic Visit)
--------------------------------------------------
Patient Name: ${appointment.fullName}
Phone: ${appointment.phone}
Email: ${appointment.email}
Age: ${appointment.age}
Reason for Visit: ${appointment.reason}
Consultation Mode: In-Person (Offline Clinic Visit)
Payment: ${appointment.paymentMethod || 'Cash'} (₹${appointment.amount || 800}) - ${appointment.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
Notes: ${appointment.notes || appointment.message || 'Please arrive at the clinic 10 minutes prior to your slot.'}

Clinic Address:
${CLINIC.name}
${CLINIC.address.full}
Doctor Contact: ${CLINIC.phone.display}
Doctor Email: ${DOCTOR_EMAIL}`
    : `ONLINE CONSULTATION (Google Meet)
--------------------------------------------------
Patient Name: ${appointment.fullName}
Phone: ${appointment.phone}
Email: ${appointment.email}
Age: ${appointment.age}
Reason for Visit: ${appointment.reason}
Consultation Mode: Online Video (Google Meet)
Payment: ${appointment.paymentMethod || 'Online'} (₹${appointment.amount || 800})
Notes: ${appointment.notes || appointment.message || 'Please join the Google Meet link 5 minutes before scheduled slot.'}

Doctor Contact: ${CLINIC.phone.display}
Doctor Email: ${DOCTOR_EMAIL}`;

  // Attendees list: sends calendar invite to patient's email and doctor's calendar
  const attendees: { email: string; displayName: string; responseStatus?: string }[] = [
    {
      email: DOCTOR_EMAIL,
      displayName: `${CLINIC.doctor.name} (Doctor)`,
      responseStatus: 'accepted',
    },
  ];

  if (appointment.email && appointment.email.includes('@') && !appointment.email.endsWith('@walkin.clinic')) {
    attendees.push({
      email: appointment.email.trim(),
      displayName: appointment.fullName,
    });
  }

  // Event payload
  const eventPayload: any = {
    summary,
    description,
    location,
    start: {
      dateTime: startIso,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: endIso,
      timeZone: 'Asia/Kolkata',
    },
    attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 30 },      // 30 mins before
      ],
    },
  };

  // Add Google Meet conference link for online consultations
  if (!isOffline) {
    eventPayload.conferenceData = {
      createRequest: {
        requestId: `appt-${appointment.id}-${Date.now()}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    };
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: isOffline ? 0 : 1,
    sendUpdates: 'all', // Dispatches calendar invite on email to attendees
    requestBody: eventPayload,
  });

  const eventData = response.data;
  let meetLink = eventData.hangoutLink || '';

  if (!meetLink && !isOffline && eventData.conferenceData?.entryPoints) {
    const videoPoint = eventData.conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === 'video'
    );
    if (videoPoint?.uri) {
      meetLink = videoPoint.uri;
    }
  }

  if (!meetLink) {
    meetLink = `https://meet.google.com/lookup/${appointment.id}`;
  }

  return {
    meetLink,
    eventId: eventData.id || '',
  };
}

/**
 * Reschedules an existing Google Calendar event to a new date and time.
 * Automatically updates start/end time, summary, location, and sends
 * updated email invitations to attendees with sendUpdates: 'all'.
 */
export async function rescheduleCalendarMeeting(
  appointment: Appointment,
  newDate: string,
  newTime: string,
  newConsultationType?: 'online' | 'offline',
  durationMinutes = getCachedSlotDuration()
): Promise<{ meetLink?: string; eventId?: string }> {
  const oauth2Client = getOAuth2Client();
  const isOffline = (newConsultationType || appointment.consultationType) === 'offline';

  if (!oauth2Client || !isGoogleConnected()) {
    return {
      meetLink: isOffline ? undefined : appointment.meetLink,
      eventId: appointment.googleEventId,
    };
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const start = new Date(`${newDate}T${newTime}:00+05:30`);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const summary = isOffline
    ? `[In-Clinic / Offline] Consultation: ${appointment.fullName} - ${CLINIC.name}`
    : `Consultation: ${appointment.fullName} - ${CLINIC.doctor.name}`;

  const location = isOffline
    ? `${CLINIC.address.full}`
    : appointment.meetLink || 'Google Meet Video Call';

  const description = isOffline
    ? `In-Clinic Consultation (Rescheduled)
Patient: ${appointment.fullName}
Phone: ${appointment.phone}
Email: ${appointment.email}
Reason for Visit: ${appointment.reason}
Mode: In-Clinic / In-Person Consultation
Clinic Address: ${CLINIC.address.full}
Payment: ${appointment.paymentMethod || 'Cash'} (₹${appointment.amount || 800})`
    : `Online Video Consultation (Rescheduled)
Patient: ${appointment.fullName}
Phone: ${appointment.phone}
Email: ${appointment.email}
Reason for Visit: ${appointment.reason}
Mode: 📹 Online Video (Google Meet)
Meet Link: ${appointment.meetLink || 'Generated on Google Calendar'}
Payment: ${appointment.paymentMethod || 'Online'} (₹${appointment.amount || 800})`;

  if (appointment.googleEventId) {
    try {
      const response = await calendar.events.patch({
        calendarId: 'primary',
        eventId: appointment.googleEventId,
        sendUpdates: 'all', // Dispatches updated calendar invite to attendees
        requestBody: {
          summary,
          location,
          description,
          start: {
            dateTime: startIso,
            timeZone: 'Asia/Kolkata',
          },
          end: {
            dateTime: endIso,
            timeZone: 'Asia/Kolkata',
          },
        },
      });

      return {
        meetLink: response.data.hangoutLink || appointment.meetLink,
        eventId: response.data.id || appointment.googleEventId,
      };
    } catch (patchErr) {
      console.warn('Failed to patch existing event, falling back to insert:', patchErr);
    }
  }

  // Fallback to creating a new event if none existed
  return createCalendarMeeting({
    ...appointment,
    date: newDate,
    time: newTime,
    consultationType: newConsultationType || appointment.consultationType,
  });
}

/**
 * Queries Google Calendar for booked events on a given date (Asia/Kolkata).
 * Returns array of booked time slot strings (e.g. ['09:00', '09:45']).
 */
export async function getBookedSlotsFromCalendar(date: string): Promise<string[]> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client || !isGoogleConnected()) {
    return [];
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const timeMin = new Date(`${date}T00:00:00+05:30`).toISOString();
    const timeMax = new Date(`${date}T23:59:59+05:30`).toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const bookedSlots = new Set<string>();
    for (const item of response.data.items || []) {
      if (item.status === 'cancelled') continue;
      const startDateTime = item.start?.dateTime;
      if (startDateTime) {
        const d = new Date(startDateTime);
        const istTime = d.toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        bookedSlots.add(istTime);
      }
    }

    return Array.from(bookedSlots);
  } catch (err) {
    console.error('Failed to query Google Calendar for booked slots:', err);
    return [];
  }
}

/**
 * Generates an instant 1-Click "Add to Google Calendar" web URL prefilled with
 * doctor and client attendees, Google Meet link, and date/time.
 */
export function generateGoogleCalendarUrl(
  appointment: Appointment,
  durationMinutes = getCachedSlotDuration()
): string {
  const start = new Date(`${appointment.date}T${appointment.time}:00+05:30`);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const formatUtc = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dates = `${formatUtc(start)}/${formatUtc(end)}`;

  const isOffline = appointment.consultationType === 'offline';

  const title = isOffline
    ? `[In-Clinic / Offline] Consultation: ${appointment.fullName} - ${CLINIC.doctor.name}`
    : `[Online Video] Consultation: ${appointment.fullName} & ${CLINIC.doctor.name}`;

  const details = isOffline
    ? `IN-CLINIC / OFFLINE CONSULTATION (In-Person Clinic Visit)
--------------------------------------------------
Patient Name: ${appointment.fullName}
Phone: ${appointment.phone}
Email: ${appointment.email}
Age: ${appointment.age}
Reason: ${appointment.reason}
Payment: ${appointment.paymentMethod || 'Cash'} (₹${appointment.amount || 800})
Notes: ${appointment.notes || appointment.message || 'Please arrive 10 mins early.'}

Clinic Address:
${CLINIC.name}
${CLINIC.address.full}
Doctor Contact: ${CLINIC.phone.display}
Doctor Email: ${DOCTOR_EMAIL}`
    : `ONLINE CONSULTATION (Google Meet)
--------------------------------------------------
Patient Name: ${appointment.fullName}
Phone: ${appointment.phone}
Email: ${appointment.email}
Age: ${appointment.age}
Reason: ${appointment.reason}
Notes: ${appointment.notes || appointment.message || 'No additional notes'}

Google Meet: ${appointment.meetLink || 'Will be shared'}

Clinic Details:
${CLINIC.name}
${CLINIC.address.full}
Doctor Contact: ${CLINIC.phone.display}
Doctor Email: ${DOCTOR_EMAIL}`;

  const location = isOffline
    ? `${CLINIC.name}, ${CLINIC.address.full}`
    : appointment.meetLink || 'Google Meet Video Call';

  const addGuests = `${DOCTOR_EMAIL},${appointment.email}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details,
    location,
    add: addGuests,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates an iCalendar (.ics) formatted string for calendar import.
 */
export function generateIcsContent(
  appointment: Appointment,
  durationMinutes = getCachedSlotDuration()
): string {
  const start = new Date(`${appointment.date}T${appointment.time}:00+05:30`);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const formatUtc = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const isOffline = appointment.consultationType === 'offline';
  const summary = isOffline
    ? `[In-Clinic / Offline] Consultation: ${appointment.fullName} - ${CLINIC.name}`
    : `Online Video Consultation: ${appointment.fullName} & ${CLINIC.doctor.name}`;

  const location = isOffline
    ? `${CLINIC.name}, ${CLINIC.address.full}`
    : appointment.meetLink || 'Google Meet Video Call';

  const description = isOffline
    ? `In-Clinic (Offline) Consultation\\nPatient: ${appointment.fullName}\\nPhone: ${appointment.phone}\\nMode: Offline Visit\\nPayment: ${appointment.paymentMethod || 'Cash'} (₹${appointment.amount || 800})\\nAddress: ${CLINIC.address.full}`
    : `Online Consultation\\nPatient: ${appointment.fullName}\\nPhone: ${appointment.phone}\\nReason: ${appointment.reason}\\nGoogle Meet: ${appointment.meetLink || ''}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${CLINIC.name}//Appointment//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:appt-${appointment.id}@happymorningpilesclinic.local`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    `ORGANIZER;CN=${CLINIC.doctor.name}:mailto:${DOCTOR_EMAIL}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${CLINIC.doctor.name}:mailto:${DOCTOR_EMAIL}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;CN=${appointment.fullName}:mailto:${appointment.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}