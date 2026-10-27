import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  saveAppointment,
  getBookedSlotsForDate,
  Appointment,
} from '@/lib/storage';
import {
  isGoogleConnected,
  createCalendarMeeting,
  generateGoogleCalendarUrl,
  DOCTOR_EMAIL,
} from '@/lib/google';
import {
  isDateBlockedByDoctor,
  getBlockedSlotsForDate,
} from '@/lib/availability';
import { getBulkCalendarAvailability } from '@/lib/cache';
import { getClinicSettings, isTimeSlotTaken } from '@/lib/clinicSettings';
import {
  generateSlots,
  getSlotStep,
  expandBookedTimes,
  isClinicClosedOn,
  getWeekday,
  getLocations,
  getBookableLocations,
  sameLocation,
  WEEKDAY_NAMES,
} from '@/lib/slots';
import { formatSlotLabel } from '@/lib/slots';
import { CLINIC } from '@/lib/clinicInfo';
import { isMsg91ConfirmationConfigured, sendMsg91WhatsApp } from '@/lib/msg91';
import { formatDateLong, modeLabel } from '@/lib/reminderEmails';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  const bulk = searchParams.get('bulk') === 'true';

  // If bulk requested or no single date specified, return whole calendar state in < 1ms
  if (bulk || !date) {
    const [bulkData, settings] = await Promise.all([
      getBulkCalendarAvailability(),
      getClinicSettings(),
    ]);
    const slotValues = generateSlots(settings).map((s) => s.value);
    const step = getSlotStep(settings);

    // Expand raw booked times into every slot they block (duration + buffer)
    const bookedSlotsByDate: Record<string, string[]> = {};
    for (const [d, times] of Object.entries(bulkData.bookedSlotsByDate)) {
      bookedSlotsByDate[d] = expandBookedTimes(slotValues, times, step);
    }

    return NextResponse.json({ ...bulkData, bookedSlotsByDate, settings }, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      },
    });
  }

  const settings = await getClinicSettings();
  const locationParam = searchParams.get('location')?.trim() || undefined;
  const daySlots = generateSlots(settings, date, locationParam);
  const slotValues = daySlots.map((s) => s.value);
  const step = getSlotStep(settings);

  const [doctorDateBlock, doctorBlockedSlots, dbBookedTimes] = await Promise.all([
    isDateBlockedByDoctor(date),
    getBlockedSlotsForDate(date, slotValues),
    getBookedSlotsForDate(date),
  ]);

  // Booked times block neighbouring slots too (appointment duration + buffer)
  const dbBookedSlots = expandBookedTimes(slotValues, dbBookedTimes, step);
  const allBookedSlots = Array.from(
    new Set([...dbBookedSlots, ...doctorBlockedSlots])
  );

  return NextResponse.json(
    {
      date,
      isClinicClosed: isClinicClosedOn(settings, date, locationParam),
      slots: daySlots,
      bookedSlots: allBookedSlots,
      doctorBlockedSlots,
      isDoctorBlocked: doctorDateBlock.blocked,
      doctorBlockReason: doctorDateBlock.reason,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fullName,
      phone,
      email,
      age,
      reason,
      date,
      time,
      message,
      paymentId,
      paymentMethod,
      location: requestedLocation,
    } = body;

    // Validation
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 3) {
      return NextResponse.json(
        { error: 'Full name is required (minimum 3 characters).' },
        { status: 400 }
      );
    }

    const rawPhone = typeof phone === 'string' ? phone.trim().replace(/[\s-]/g, '') : '';
    if (!rawPhone || !/^(\+91|91|0)?[6-9]\d{9}$/.test(rawPhone)) {
      return NextResponse.json(
        { error: 'A valid 10-digit mobile number starting with 6, 7, 8, or 9 is required.' },
        { status: 400 }
      );
    }
    const cleanPhone = rawPhone.replace(/^(\+91|91|0)/, '');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    const ageNum = Number(age);
    if (!age || !Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      return NextResponse.json(
        { error: 'Age must be an integer between 1 and 120.' },
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json(
        { error: 'Reason for consultation is required.' },
        { status: 400 }
      );
    }

    if (!date || typeof date !== 'string') {
      return NextResponse.json(
        { error: 'Preferred date is required (YYYY-MM-DD).' },
        { status: 400 }
      );
    }

    const dateParts = date.split('-').map(Number);
    if (dateParts.length !== 3 || dateParts.some(isNaN)) {
      return NextResponse.json(
        { error: 'Invalid date format. Expected YYYY-MM-DD.' },
        { status: 400 }
      );
    }
    const [year, month, day] = dateParts;
    const dateUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    // Closed weekdays (Sunday by default) are enforced below from the doctor's day-wise schedule.
    if (isNaN(dateUtc.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date. Expected YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    // Appointments can only be booked from tomorrow onwards (in Asia/Kolkata timezone)
    const now = new Date();
    const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const [ty, tm, td] = istToday.split('-').map(Number);
    const tomorrowUtc = new Date(Date.UTC(ty, tm - 1, td + 1, 12, 0, 0));
    const tomorrowIso = tomorrowUtc.toISOString().slice(0, 10);

    if (date < tomorrowIso) {
      return NextResponse.json(
        {
          error:
            'Appointments must be booked from tomorrow onwards. Same-day and previous date bookings are not allowed.',
        },
        { status: 400 }
      );
    }

    if (!time || typeof time !== 'string') {
      return NextResponse.json(
        { error: 'An appointment time slot is required.' },
        { status: 400 }
      );
    }

    if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
      return NextResponse.json(
        { error: 'Payment of ₹800 is required to confirm your appointment.' },
        { status: 400 }
      );
    }

    // Check doctor availability override (Full Day or Slot)
    const doctorDateBlock = await isDateBlockedByDoctor(date);
    if (doctorDateBlock.blocked) {
      return NextResponse.json(
        {
          error: `Doctor is unavailable on ${date} (${doctorDateBlock.reason || 'Doctor on leave'}). Please choose another date.`,
          isDoctorBlocked: true,
        },
        { status: 400 }
      );
    }

    const settings = await getClinicSettings();

    // The patient must pick one of the doctor's locations (auto-picked when there is only one).
    const bookableLocations = getBookableLocations(settings);
    let bookingLocation: string | undefined;
    if (typeof requestedLocation === 'string' && requestedLocation.trim()) {
      bookingLocation = getLocations(settings).find((l) => sameLocation(l, requestedLocation));
      if (!bookingLocation) {
        return NextResponse.json(
          { error: 'That clinic location is not available. Please choose a location from the list.' },
          { status: 400 }
        );
      }
    } else if (bookableLocations.length === 1) {
      bookingLocation = bookableLocations[0];
    } else {
      return NextResponse.json(
        { error: 'Please choose a clinic location before booking.' },
        { status: 400 }
      );
    }

    if (isClinicClosedOn(settings, date, bookingLocation)) {
      return NextResponse.json(
        {
          error: `The doctor does not take appointments at ${bookingLocation} on ${WEEKDAY_NAMES[getWeekday(date)]}s. Please choose another date.`,
        },
        { status: 400 }
      );
    }
    const daySlots = generateSlots(settings, date, bookingLocation);
    const slotValues = daySlots.map((s) => s.value);
    if (!slotValues.includes(time)) {
      return NextResponse.json(
        { error: `${time} is not an available appointment slot at ${bookingLocation} on ${WEEKDAY_NAMES[getWeekday(date)]}. Please select one of the available slots.` },
        { status: 400 }
      );
    }

    const doctorBlockedSlots = await getBlockedSlotsForDate(date, slotValues);
    if (doctorBlockedSlots.includes(time)) {
      return NextResponse.json(
        {
          error: `The time slot ${time} on ${date} is unavailable as doctor is not available at this time. Please select another slot.`,
          isDoctorBlocked: true,
        },
        { status: 409 }
      );
    }

    // Check if slot is already booked in MySQL DB
    const dbBooked = await isTimeSlotTaken(date, time);
    if (dbBooked) {
      return NextResponse.json(
        {
          error:
            `The time slot ${time} on ${date} is already booked. Please select another slot.`,
          isBooked: true,
        },
        { status: 409 }
      );
    }

    const appointmentId = crypto.randomUUID();
    const newAppointment: Appointment = {
      id: appointmentId,
      fullName: fullName.trim(),
      phone: cleanPhone,
      email: email.trim(),
      age: ageNum,
      reason: reason.trim(),
      date,
      time,
      message: message ? String(message).trim() : '',
      createdAt: new Date().toISOString(),
      status: 'confirmed',
      paymentStatus: 'paid',
      amount: 800,
      paymentMethod: paymentMethod || 'Razorpay',
      paymentId: paymentId.trim(),
      paidAt: new Date().toISOString(),
      notes: '',
      location: bookingLocation,
    };

    let meetLink = '';
    let googleEventId = '';
    let calendarError = '';
    const googleConnected = isGoogleConnected();

    if (googleConnected) {
      try {
        const meetingResult = await createCalendarMeeting(newAppointment);
        meetLink = meetingResult.meetLink;
        googleEventId = meetingResult.eventId;
        newAppointment.meetLink = meetLink;
        newAppointment.googleEventId = googleEventId;
      } catch (calError) {
        console.error('Google Calendar event creation failed:', calError);
        calendarError = calError instanceof Error ? calError.message : 'Calendar sync failed';
        meetLink = `https://meet.google.com/lookup/hmpc-${appointmentId.slice(0, 8)}`;
        newAppointment.meetLink = meetLink;
      }
    } else {
      meetLink = `https://meet.google.com/lookup/hmpc-${appointmentId.slice(0, 8)}`;
      newAppointment.meetLink = meetLink;
    }

    await saveAppointment(newAppointment);

    // WhatsApp booking confirmation (MSG91 template "reminder1").
    // Template body: Hello {{1}}, Thank you for booking with {{2}}.
    //                Your appointment for {{3}} on {{4}} at {{5}} is confirmed.
    // Awaited so Vercel doesn't stop the function early; a failure never blocks the booking.
    if (isMsg91ConfirmationConfigured()) {
      try {
        const a = {
          ...newAppointment,
          consultationType: newAppointment.consultationType ?? ('online' as const),
        };
        await sendMsg91WhatsApp({
          template: process.env.MSG91_WHATSAPP_TEMPLATE_CONFIRMATION,
          phone: a.phone,
          bodyValues: [
            a.fullName, // {{1}}
            CLINIC.name, // {{2}}
            modeLabel(a), // {{3}}
            formatDateLong(a.date), // {{4}}
            formatSlotLabel(a.time), // {{5}}
          ],
        });
      } catch (waErr) {
        console.error('WhatsApp confirmation failed:', waErr);
      }
    }

    const googleCalendarUrl = generateGoogleCalendarUrl(newAppointment);
    const eventCreated = Boolean(googleEventId);

    return NextResponse.json(
      {
        success: true,
        appointment: newAppointment,
        meetLink,
        googleCalendarUrl,
        googleConnected: eventCreated,
        doctorEmail: DOCTOR_EMAIL,
        calendarError: calendarError || undefined,
        message: eventCreated
          ? 'Your consultation has been booked successfully! The appointment and Google Meet video link have been scheduled on your calendar.'
          : 'Your consultation has been booked! Use the button below to add it to your calendar.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error booking appointment:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}