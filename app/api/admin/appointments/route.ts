import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getAllAppointments,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  saveAppointment,
  Appointment,
} from '@/lib/storage';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { isTimeSlotTaken, getClinicSettings } from '@/lib/clinicSettings';
import {
  isGoogleConnected,
  createCalendarMeeting,
  rescheduleCalendarMeeting,
  DOCTOR_EMAIL,
} from '@/lib/google';
import { triggerConfirmationCall } from '@/lib/voiceCall';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access.' },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.toLowerCase() || '';
    const statusFilter = searchParams.get('status') || 'all';
    const timeFilter = searchParams.get('time') || 'all';
    const modeFilter = searchParams.get('mode') || 'all';
    const forceFresh = searchParams.get('fresh') === 'true' || searchParams.has('_t');

    let appointments = await getAllAppointments(forceFresh);

    // Sort by date descending (latest first)
    appointments.sort((a, b) => {
      const dateA = `${a.date}T${a.time}`;
      const dateB = `${b.date}T${b.time}`;
      return dateB.localeCompare(dateA);
    });

    const nowIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // Compute aggregate summary before filtering
    const totalCount = appointments.length;
    const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
    const completedCount = appointments.filter((a) => a.status === 'completed').length;
    const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;

    const totalRevenue = appointments
      .filter((a) => a.status !== 'cancelled' && a.paymentStatus === 'paid')
      .reduce((sum, a) => sum + (a.amount || 800), 0);

    const pendingRevenue = appointments
      .filter((a) => a.status !== 'cancelled' && a.paymentStatus === 'pending')
      .reduce((sum, a) => sum + (a.amount || 800), 0);

    const uniquePatients = new Set(
      appointments.map((a) => {
        const cleanEmail = a.email ? a.email.trim().toLowerCase() : '';
        if (cleanEmail) return cleanEmail;
        const cleanPhone = a.phone ? a.phone.replace(/[^0-9]/g, '').slice(-10) : '';
        return cleanPhone ? `phone:${cleanPhone}` : a.id;
      })
    ).size;

    // Apply Filters
    if (query) {
      appointments = appointments.filter(
        (a) =>
          a.fullName.toLowerCase().includes(query) ||
          a.phone.includes(query) ||
          a.email.toLowerCase().includes(query) ||
          a.reason.toLowerCase().includes(query) ||
          (a.paymentId && a.paymentId.toLowerCase().includes(query))
      );
    }

    if (statusFilter !== 'all') {
      appointments = appointments.filter((a) => a.status === statusFilter);
    }

    if (timeFilter === 'today') {
      appointments = appointments.filter((a) => a.date === nowIso);
    } else if (timeFilter === 'upcoming') {
      appointments = appointments.filter((a) => a.date >= nowIso && a.status !== 'cancelled');
    } else if (timeFilter === 'past') {
      appointments = appointments.filter((a) => a.date < nowIso);
    }

    if (modeFilter === 'offline') {
      appointments = appointments.filter((a) => a.consultationType === 'offline');
    } else if (modeFilter === 'online') {
      appointments = appointments.filter((a) => a.consultationType !== 'offline');
    }

    const response = NextResponse.json({
      appointments,
      stats: {
        totalCount,
        confirmedCount,
        completedCount,
        cancelledCount,
        totalRevenue,
        pendingRevenue,
        uniquePatients,
      },
    });
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    return response;
  } catch (err: unknown) {
    console.error('Error fetching admin appointments:', err);
    return NextResponse.json(
      { error: 'Failed to fetch appointments.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      id,
      status,
      paymentStatus,
      paymentMethod,
      amount,
      notes,
      date,
      time,
      consultationType,
      isReschedule,
      rescheduleReason,
    } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Appointment ID is required.' },
        { status: 400 }
      );
    }

    const existing = await getAppointmentById(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Appointment not found.' },
        { status: 404 }
      );
    }

    const updates: Partial<Appointment> = {};
    if (status) updates.status = status;
    if (paymentStatus) {
      updates.paymentStatus = paymentStatus;
      if (paymentStatus === 'paid' && !updates.paidAt) {
        updates.paidAt = new Date().toISOString();
      }
    }
    if (paymentMethod) updates.paymentMethod = paymentMethod;
    if (typeof amount === 'number') updates.amount = amount;
    if (typeof notes === 'string') updates.notes = notes;

    let calendarRescheduled = false;

    // Rescheduling Logic
    if (isReschedule || date || time || (consultationType && consultationType !== existing.consultationType)) {
      const targetDate = date || existing.date;
      const targetTime = time || existing.time;
      const targetType = consultationType || existing.consultationType || 'online';

      // Verify slot availability if changing date or time
      if (targetDate !== existing.date || targetTime !== existing.time) {
        const isTaken = await isTimeSlotTaken(targetDate, targetTime, id);
        if (isTaken) {
          return NextResponse.json(
            { error: `The slot ${targetTime} on ${targetDate} is already booked by another appointment.` },
            { status: 409 }
          );
        }
      }

      // Make sure the calendar event length follows the current appointment settings
      await getClinicSettings();

      // Sync with Google Calendar if connected
      if (isGoogleConnected()) {
        try {
          const calResult = await rescheduleCalendarMeeting(
            existing,
            targetDate,
            targetTime,
            targetType
          );
          if (calResult.meetLink) {
            updates.meetLink = calResult.meetLink;
          }
          if (calResult.eventId) {
            updates.googleEventId = calResult.eventId;
            calendarRescheduled = true;
          }
        } catch (calErr) {
          console.error('Failed to reschedule on Google Calendar:', calErr);
        }
      }

      updates.date = targetDate;
      updates.time = targetTime;
      updates.consultationType = targetType;
    }

    const updated = await updateAppointment(id, updates);
    if (!updated) {
      return NextResponse.json(
        { error: 'Appointment not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: isReschedule ? 'Appointment rescheduled successfully.' : 'Appointment updated successfully.',
      appointment: updated,
      calendarRescheduled,
    });
  } catch (err: unknown) {
    console.error('Error updating appointment:', err);
    return NextResponse.json(
      { error: 'Failed to update appointment.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access.' },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Appointment ID is required.' },
        { status: 400 }
      );
    }

    await deleteAppointment(id);

    return NextResponse.json({
      message: 'Appointment removed successfully.',
    });
  } catch (err: unknown) {
    console.error('Error deleting appointment:', err);
    return NextResponse.json(
      { error: 'Failed to delete appointment.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access.' },
      { status: 401 }
    );
  }

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
      consultationType = 'offline', // 'offline' or 'online'
      paymentMethod = 'Cash',      // 'Cash', 'UPI', 'Card', 'Pending'
      paymentStatus = 'paid',      // 'paid' or 'pending'
      amount = 800,
      notes = '',
      message = '',
    } = body;

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return NextResponse.json({ error: 'Patient full name is required (minimum 2 characters).' }, { status: 400 });
    }

    const rawPhone = typeof phone === 'string' ? phone.trim().replace(/[\s-]/g, '') : '';
    if (!/^(\+91|91|0)?[6-9]\d{9}$/.test(rawPhone)) {
      return NextResponse.json(
        { error: 'A valid 10-digit mobile number starting with 6, 7, 8, or 9 is required.' },
        { status: 400 }
      );
    }
    const cleanPhone = rawPhone.replace(/^(\+91|91|0)/, '');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    if (consultationType === 'online' && (!trimmedEmail || !emailRegex.test(trimmedEmail))) {
      return NextResponse.json(
        { error: 'A valid email address is required for online video (Google Meet) consultations.' },
        { status: 400 }
      );
    }
    if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address (e.g. name@example.com).' },
        { status: 400 }
      );
    }
    const finalEmail = trimmedEmail || 'patient@walkin.clinic';

    let validatedAge = 0;
    if (age !== undefined && age !== null && age !== '') {
      const ageNum = Number(age);
      if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
        return NextResponse.json(
          { error: 'Age must be an integer between 1 and 120.' },
          { status: 400 }
        );
      }
      validatedAge = ageNum;
    }

    if (!date || !time) {
      return NextResponse.json({ error: 'Appointment date and time slot are required.' }, { status: 400 });
    }

    // Check if slot is already booked in MySQL DB
    const dbBooked = await isTimeSlotTaken(date, time);
    if (dbBooked) {
      return NextResponse.json(
        { error: `The time slot ${time} on ${date} is already booked. Please choose a different slot.` },
        { status: 409 }
      );
    }

    const appointmentId = crypto.randomUUID();
    const finalAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 800;

    const newAppointment: Appointment = {
      id: appointmentId,
      fullName: fullName.trim(),
      phone: cleanPhone,
      email: finalEmail,
      age: validatedAge,
      reason: reason?.trim() || 'General Consultation',
      date,
      time,
      message: message ? String(message).trim() : '',
      createdAt: new Date().toISOString(),
      status: 'confirmed',
      paymentStatus: paymentStatus as 'paid' | 'pending',
      amount: finalAmount,
      paymentMethod: paymentMethod as any,
      paymentId: `${paymentMethod.toUpperCase()}-${appointmentId.slice(0, 8).toUpperCase()}`,
      paidAt: paymentStatus === 'paid' ? new Date().toISOString() : undefined,
      notes: notes?.trim() || '',
      consultationType: consultationType as 'online' | 'offline',
    };

    // Calendar sync & meeting invite
    let meetLink = '';
    let googleEventId = '';
    let calendarScheduled = false;
    let calendarMessage = '';

    if (isGoogleConnected()) {
      try {
        const calResult = await createCalendarMeeting(newAppointment);
        meetLink = calResult.meetLink;
        googleEventId = calResult.eventId;
        newAppointment.meetLink = meetLink || undefined;
        newAppointment.googleEventId = googleEventId || undefined;
        calendarScheduled = true;
        calendarMessage = consultationType === 'offline'
          ? 'In-clinic offline consultation scheduled on Google Calendar. Patient will receive the calendar invitation on email.'
          : 'Google Meet meeting created. Video invite sent to patient and doctor email.';
      } catch (calErr: any) {
        console.error('Admin appointment calendar sync failed:', calErr);
        calendarMessage = `Appointment saved, but calendar invite failed: ${calErr.message}`;
      }
    } else {
      calendarMessage = 'Appointment booked. (Google Calendar is not authorized - connect in settings to auto-dispatch calendar invites)';
    }

    await saveAppointment(newAppointment);

    // AI confirmation call - fire and forget, must never block or fail the booking
    void triggerConfirmationCall(newAppointment, { source: 'admin-booking' });

    return NextResponse.json(
      {
        success: true,
        appointment: newAppointment,
        calendarScheduled,
        calendarMessage,
        message: 'Appointment successfully scheduled from Admin Panel!',
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('Error booking admin appointment:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to schedule appointment.' },
      { status: 500 }
    );
  }
}