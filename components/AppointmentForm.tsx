'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import CalendarPicker from './CalendarPicker';
import { toast } from '@/components/ui/Toast';
import { useClinicSettings } from '@/lib/useClinicSettings';

interface FormData {
  fullName: string;
  phone: string;
  email: string;
  age: string;
  reason: string;
  date: string;
  time: string;
  message: string;
}

interface ConfirmedBooking {
  id: string;
  fullName: string;
  email: string;
  date: string;
  time: string;
  reason: string;
  paymentId?: string;
  amount?: number;
  meetLink?: string;
  googleCalendarUrl?: string;
  googleConnected?: boolean;
  doctorEmail?: string;
  calendarError?: string;
}

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

interface RazorpayFailureResponse {
  error?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
  };
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  handler: (response: RazorpaySuccessResponse) => void;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, callback: (response: RazorpayFailureResponse) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const RAZORPAY_KEY_ID =
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TnHamcVIUGKBfj';
const CONSULTATION_FEE_INR = 800;

function loadRazorpayCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existingScript = document.getElementById('razorpay-checkout-js') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function AppointmentForm() {
  const { slots: SLOTS } = useClinicSettings();
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    phone: '',
    email: '',
    age: '',
    reason: '',
    date: '',
    time: '',
    message: '',
  });

  const [bookingStep, setBookingStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isCheckingSlot, setIsCheckingSlot] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);
  const [tomorrowIso, setTomorrowIso] = useState('');

  // Real booked slots loaded from backend
  const [serverBookedSlots, setServerBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Doctor availability overrides loaded from backend
  const [doctorBlockedDates, setDoctorBlockedDates] = useState<{ date: string; reason: string }[]>([]);
  const [doctorBlockedSlots, setDoctorBlockedSlots] = useState<string[]>([]);
  const [isDoctorDateBlocked, setIsDoctorDateBlocked] = useState(false);
  const [doctorBlockReason, setDoctorBlockReason] = useState('');

  // Instant client-side slots cache for sub-millisecond date switching
  const slotsCacheRef = useRef<
    Map<
      string,
      {
        bookedSlots: string[];
        doctorBlockedSlots: string[];
        isDoctorBlocked: boolean;
        doctorBlockReason: string;
      }
    >
  >(new Map());

  // Google status for doctor
  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    hasConfig: boolean;
    doctorEmail: string;
  } | null>(null);
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);

  const successBoxRef = useRef<HTMLDivElement>(null);
  const calendarSectionRef = useRef<HTMLDivElement>(null);
  const slotSectionRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const paymentStepRef = useRef<HTMLDivElement>(null);

  // Check URL params for Google OAuth feedback & status, fetch doctor availability, and preload Razorpay script
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('google_connected') === 'true') {
        setGoogleMessage('Google Calendar successfully connected!');
      } else if (params.get('google_error')) {
        setGoogleMessage(`Google Authorization Notice: ${params.get('google_error')}`);
      }
    }

    fetchGoogleStatus();
    fetchDoctorAvailability();
    preloadBulkCalendar();
    loadRazorpayCheckoutScript();
  }, []);

  // Keep an already-open booking page in sync with doctor blackouts set in admin.
  useEffect(() => {
    const refreshAvailability = () => {
      if (document.visibilityState !== 'visible') return;
      fetchDoctorAvailability();
      preloadBulkCalendar();
    };

    window.addEventListener('focus', refreshAvailability);
    document.addEventListener('visibilitychange', refreshAvailability);
    const intervalId = window.setInterval(refreshAvailability, 15_000);

    return () => {
      window.removeEventListener('focus', refreshAvailability);
      document.removeEventListener('visibilitychange', refreshAvailability);
      window.clearInterval(intervalId);
    };
  }, []);

  const preloadBulkCalendar = () => {
    fetch(`/api/appointments?bulk=true&t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.blockedDates)) {
          setDoctorBlockedDates(data.blockedDates);
        }
        if (data.bookedSlotsByDate) {
          const docSlotsByDate = data.doctorBlockedSlotsByDate || {};
          const fullLeaves = new Set((data.blockedDates || []).map((b: { date: string }) => b.date));

          Object.keys(data.bookedSlotsByDate).forEach((d) => {
            const booked = data.bookedSlotsByDate[d] || [];
            const docBlocked = docSlotsByDate[d] || [];
            const isDocBlocked = fullLeaves.has(d);
            slotsCacheRef.current.set(d, {
              bookedSlots: Array.from(new Set([...booked, ...docBlocked])),
              doctorBlockedSlots: docBlocked,
              isDoctorBlocked: isDocBlocked,
              doctorBlockReason: isDocBlocked ? 'Doctor on leave' : '',
            });
          });

          // If current form date is already in cache, set immediately
          if (formData.date && slotsCacheRef.current.has(formData.date)) {
            const initialSlot = slotsCacheRef.current.get(formData.date)!;
            setServerBookedSlots(initialSlot.bookedSlots);
            setDoctorBlockedSlots(initialSlot.doctorBlockedSlots);
            setIsDoctorDateBlocked(initialSlot.isDoctorBlocked);
            setDoctorBlockReason(initialSlot.doctorBlockReason);
          }
        }
      })
      .catch((err) => console.error('Bulk calendar preload error:', err));
  };

  const fetchDoctorAvailability = () => {
    fetch(`/api/availability?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.blockedDates)) {
          setDoctorBlockedDates(data.blockedDates);
        }
      })
      .catch((err) => console.error('Error fetching doctor availability:', err));
  };

  const fetchGoogleStatus = () => {
    fetch('/api/auth/google/status', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setGoogleStatus(data))
      .catch((err) => console.error('Error fetching Google status:', err));
  };

  // Initialize date logic safely on client side (only allow booking from tomorrow onwards)
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    setTomorrowIso(tomorrowStr);

    // Initial date: start from tomorrow; if tomorrow is Sunday, advance to Monday
    const initial = new Date(tomorrow);
    if (initial.getDay() === 0) {
      initial.setDate(initial.getDate() + 1);
    }
    const initialIso = `${initial.getFullYear()}-${String(initial.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(initial.getDate()).padStart(2, '0')}`;

    setFormData((prev) => ({
      ...prev,
      date: initialIso,
    }));
  }, []);

  // Fetch booked slots whenever the selected date changes (instant 0ms from cache)
  const fetchBookedSlots = React.useCallback((dateString: string) => {
    if (!dateString) return;
    const isSun = new Date(`${dateString}T00:00:00`).getDay() === 0;
    if (isSun) {
      setServerBookedSlots([]);
      setDoctorBlockedSlots([]);
      setIsDoctorDateBlocked(false);
      setDoctorBlockReason('');
      return;
    }

    // Check fast cache first (< 0.1ms instant UI)
    const cached = slotsCacheRef.current.get(dateString);
    if (cached) {
      setServerBookedSlots(cached.bookedSlots);
      setDoctorBlockedSlots(cached.doctorBlockedSlots);
      setIsDoctorDateBlocked(cached.isDoctorBlocked);
      setDoctorBlockReason(cached.doctorBlockReason);
      setIsLoadingSlots(false);
      return;
    }

    setIsLoadingSlots(true);
    fetch(`/api/appointments?date=${dateString}`)
      .then((res) => res.json())
      .then((data) => {
        const slotData = {
          bookedSlots: Array.isArray(data.bookedSlots) ? data.bookedSlots : [],
          doctorBlockedSlots: Array.isArray(data.doctorBlockedSlots) ? data.doctorBlockedSlots : [],
          isDoctorBlocked: Boolean(data.isDoctorBlocked),
          doctorBlockReason: data.doctorBlockReason || '',
        };
        slotsCacheRef.current.set(dateString, slotData);
        setServerBookedSlots(slotData.bookedSlots);
        setDoctorBlockedSlots(slotData.doctorBlockedSlots);
        setIsDoctorDateBlocked(slotData.isDoctorBlocked);
        setDoctorBlockReason(slotData.doctorBlockReason);
      })
      .catch((err) => console.error('Failed to load booked slots:', err))
      .finally(() => setIsLoadingSlots(false));
  }, []);

  useEffect(() => {
    if (formData.date) {
      fetchBookedSlots(formData.date);
    }
  }, [formData.date, fetchBookedSlots]);

  const validateField = (
    name: keyof FormData,
    value: string,
    currentTomorrow: string = tomorrowIso
  ): string => {
    const trimmed = value.trim();

    switch (name) {
      case 'fullName':
        if (!trimmed) return 'Please enter your full name.';
        if (trimmed.length < 3) return 'Your name should be at least 3 characters.';
        if (!/^[A-Za-z][A-Za-z .'-]*$/.test(trimmed)) return 'Please use letters and spaces only.';
        return '';

      case 'phone': {
        if (!trimmed) return 'Please enter your phone number.';
        if (!/^[6-9]\d{9}$/.test(trimmed))
          return 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.';
        return '';
      }

      case 'email':
        if (!trimmed) return 'Please enter your email address.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
          return 'Please enter a valid email, for example name@example.com.';
        }
        return '';

      case 'age': {
        if (!trimmed) return 'Please enter your age.';
        const ageNum = Number(trimmed);
        if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
          return 'Please enter an age between 1 and 120.';
        }
        return '';
      }

      case 'reason':
        return trimmed ? '' : 'Please select a reason for consultation.';

      case 'date': {
        if (!trimmed) return 'Please choose a preferred date.';
        if (currentTomorrow && trimmed < currentTomorrow) {
          return 'Appointments must be booked from tomorrow onwards. Same-day or past bookings are not allowed.';
        }
        const d = new Date(`${trimmed}T00:00:00`);
        if (d.getDay() === 0) return 'The clinic is closed on Sundays. Please choose another day.';
        return '';
      }

      case 'time':
        if (!trimmed) return 'Please choose an available appointment slot.';
        if (serverBookedSlots.includes(trimmed))
          return 'This slot is already booked. Please pick another available time.';
        return '';

      case 'message':
        return trimmed.length > 300 ? 'Please keep your message under 300 characters.' : '';

      default:
        return '';
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    const fieldName = name as keyof FormData;
    const nextValue = fieldName === 'phone' ? value.replace(/\D/g, '').slice(0, 10) : value;

    setFormData((prev) => {
      const next = { ...prev, [fieldName]: nextValue };
      if (fieldName === 'date') {
        next.time = '';
      }
      return next;
    });

    if (errors[fieldName]) {
      const errorMsg = validateField(fieldName, nextValue);
      setErrors((prev) => ({ ...prev, [fieldName]: errorMsg }));
    }
  };

  const handleCalendarDateSelect = (dateIso: string) => {
    setFormData((prev) => ({
      ...prev,
      date: dateIso,
      time: '',
    }));
    setErrors((prev) => ({ ...prev, date: '', time: '' }));
  };

  const handleSlotSelect = (slotValue: string) => {
    if (serverBookedSlots.includes(slotValue)) return;
    setFormData((prev) => ({ ...prev, time: slotValue }));
    setErrors((prev) => ({ ...prev, time: '' }));
  };

  const isSunday = formData.date ? new Date(`${formData.date}T00:00:00`).getDay() === 0 : false;
  const selectedSlotLabel = SLOTS.find((s) => s.value === formData.time)?.label || '';

  const prettyDate = React.useMemo(() => {
    if (!formData.date || isSunday) return '';
    try {
      return new Date(`${formData.date}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }, [formData.date, isSunday]);

  // Validate form, verify slot availability, and directly open Razorpay Checkout for ₹800
  const handlePayAndBookSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPaymentError(null);

    const newErrors: Partial<Record<keyof FormData, string>> = {};
    const fieldKeys = Object.keys(formData) as (keyof FormData)[];

    let firstInvalidKey: keyof FormData | null = null;

    fieldKeys.forEach((key) => {
      const error = validateField(key, formData[key]);
      if (error) {
        newErrors[key] = error;
        if (!firstInvalidKey) {
          firstInvalidKey = key;
        }
      }
    });

    setErrors(newErrors);

    if (firstInvalidKey) {
      const errorMsg = newErrors[firstInvalidKey] || 'Please check and complete all required fields.';
      toast.warning(errorMsg, 'Required Information');
      if (firstInvalidKey === 'time') {
        slotSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (firstInvalidKey === 'date') {
        calendarSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const inputElement = formRef.current?.elements.namedItem(firstInvalidKey) as HTMLElement | null;
        inputElement?.focus();
      }
      return;
    }

    // Verify real-time slot availability before opening Razorpay
    setIsCheckingSlot(true);
    try {
      const res = await fetch(`/api/appointments?date=${formData.date}`);
      const data = await res.json();
      if (data.isDoctorBlocked) {
        setIsDoctorDateBlocked(true);
        setDoctorBlockReason(data.doctorBlockReason || '');
        const blockedMsg = `Doctor is unavailable on ${formData.date}. Please choose another date.`;
        setErrors((prev) => ({
          ...prev,
          date: blockedMsg,
        }));
        toast.error(blockedMsg, 'Doctor Unavailable');
        calendarSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setIsCheckingSlot(false);
        return;
      }
      if (Array.isArray(data.bookedSlots) && data.bookedSlots.includes(formData.time)) {
        setServerBookedSlots(data.bookedSlots);
        const slotMsg = 'This time slot was just booked or blocked. Please select another available slot.';
        setErrors((prev) => ({
          ...prev,
          time: slotMsg,
        }));
        toast.error(slotMsg, 'Slot Unavailable');
        slotSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setIsCheckingSlot(false);
        return;
      }
    } catch (err) {
      console.error('Error checking slot availability:', err);
    } finally {
      setIsCheckingSlot(false);
    }

    setConfirmedBooking(null);
    await handleRazorpayPayment();
  };

  // Create appointment on backend after Razorpay payment succeeds
  const createAppointmentAfterPayment = async (razorpayPaymentId: string) => {
    setIsSubmitting(true);
    setPaymentError(null);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          paymentId: razorpayPaymentId,
          paymentMethod: 'Razorpay',
          amount: CONSULTATION_FEE_INR,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          const conflictMsg = 'This time slot is already booked for this date. Please choose another slot.';
          setErrors((prev) => ({
            ...prev,
            time: conflictMsg,
          }));
          toast.error(conflictMsg, 'Slot Already Booked');
          fetchBookedSlots(formData.date);
          slotSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          const errDetail =
            result.error ||
            `Payment (${razorpayPaymentId}) succeeded, but booking encountered an error. Please contact the clinic.`;
          setPaymentError(errDetail);
          toast.error(errDetail, 'Booking Error');
        }
        setIsSubmitting(false);
        return;
      }

      // Booking confirmed!
      toast.success(
        `Appointment confirmed for ${result.appointment.fullName} on ${result.appointment.date} at ${result.appointment.time}!`,
        'Booking Confirmed'
      );

      setConfirmedBooking({
        id: result.appointment.id,
        fullName: result.appointment.fullName,
        email: result.appointment.email,
        date: result.appointment.date,
        time: result.appointment.time,
        reason: result.appointment.reason,
        paymentId: result.appointment.paymentId || razorpayPaymentId,
        amount: result.appointment.amount || CONSULTATION_FEE_INR,
        meetLink: result.meetLink,
        googleCalendarUrl: result.googleCalendarUrl,
        googleConnected: result.googleConnected,
        doctorEmail: result.doctorEmail || 'shivrajrbabar@gmail.com',
      });

      // Refresh booked slots on this date so it's locked immediately
      fetchBookedSlots(formData.date);

      // Reset form fields
      setFormData({
        fullName: '',
        phone: '',
        email: '',
        age: '',
        reason: '',
        date: formData.date,
        time: '',
        message: '',
      });
      setErrors({});

      setTimeout(() => {
        successBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        successBoxRef.current?.focus();
      }, 80);
    } catch (err) {
      console.error('Error submitting appointment after payment:', err);
      const errMsg = `Network error while finalizing booking (Payment ID: ${razorpayPaymentId}). Please try again.`;
      setPaymentError(errMsg);
      toast.error(errMsg, 'Booking Finalization Error');
    } finally {
      setIsSubmitting(false);
      setIsProcessingPayment(false);
    }
  };

  // Launch Razorpay Checkout for ₹800 directly
  const handleRazorpayPayment = async () => {
    setPaymentError(null);
    setIsProcessingPayment(true);

    const scriptLoaded = await loadRazorpayCheckoutScript();
    if (!scriptLoaded || !window.Razorpay) {
      const loadError =
        'Unable to load Razorpay payment gateway. Please check your internet connection and try again.';
      setPaymentError(loadError);
      toast.error(loadError, 'Payment Gateway Error');
      setIsProcessingPayment(false);
      return;
    }

    const cleanPhone = formData.phone.replace(/[\s-]/g, '');

    const options: RazorpayOptions = {
      key: RAZORPAY_KEY_ID,
      amount: CONSULTATION_FEE_INR * 100, // 80000 paise = ₹800
      currency: 'INR',
      name: 'Happy Morning Piles Clinic',
      description: `Consultation on ${formData.date} at ${selectedSlotLabel}`,
      prefill: {
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        contact: cleanPhone,
      },
      notes: {
        patient_name: formData.fullName.trim(),
        phone: cleanPhone,
        email: formData.email.trim(),
        age: formData.age,
        reason: formData.reason,
        appointment_date: formData.date,
        appointment_time: formData.time,
      },
      theme: {
        color: '#565ACF',
      },
      modal: {
        ondismiss: () => {
          setIsProcessingPayment(false);
          toast.warning('Payment was cancelled or closed. Appointment booking was not completed.', 'Booking Cancelled');
        },
      },
      handler: (response: RazorpaySuccessResponse) => {
        if (response && response.razorpay_payment_id) {
          createAppointmentAfterPayment(response.razorpay_payment_id);
        } else {
          const failMsg = 'Payment verification did not return a payment ID. Please try again.';
          setPaymentError(failMsg);
          toast.error(failMsg, 'Payment Failed');
          setIsProcessingPayment(false);
        }
      },
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (failure: RazorpayFailureResponse) => {
        const msg =
          failure?.error?.description ||
          'Payment failed or was declined. Please try again to complete your booking.';
        setPaymentError(msg);
        toast.error(msg, 'Payment Declined');
        setIsProcessingPayment(false);
      });
      rzp.open();
    } catch (err) {
      console.error('Failed to open Razorpay checkout:', err);
      const errMsg = 'Could not initialize Razorpay checkout. Please try again.';
      setPaymentError(errMsg);
      toast.error(errMsg, 'Checkout Error');
      setIsProcessingPayment(false);
    }
  };

  const isBusy = isCheckingSlot || isProcessingPayment || isSubmitting;

  return (
    <div>
      {/* Booking confirmation box */}
      {confirmedBooking && (
        <div
          className="success-box"
          id="success-box"
          role="status"
          tabIndex={-1}
          ref={successBoxRef}
        >
          <div className="success-payment-pill">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>
              ₹{confirmedBooking.amount || CONSULTATION_FEE_INR} Paid Successfully
              {confirmedBooking.paymentId ? ` • Payment ID: ${confirmedBooking.paymentId}` : ''}
            </span>
          </div>
          <h2>Appointment confirmed!</h2>
          <p>
            Thank you, <strong>{confirmedBooking.fullName}</strong>. Your consultation has been
            scheduled for <strong>{confirmedBooking.date}</strong> at{' '}
            <strong>
              {SLOTS.find((s) => s.value === confirmedBooking.time)?.label || confirmedBooking.time}
            </strong>
            .
          </p>

          <div className="meet-box">
            <h3>Google Meet Consultation</h3>
            <div className="notice-success">
              Your consultation has been booked successfully! The appointment with Google Meet
              video call has been scheduled on your calendar.
            </div>
          </div>
        </div>
      )}

      <div className="form-panel" ref={paymentStepRef}>
        <div className="form-heading">
          <h2>Your details</h2>
          <p>All fields are required except the message.</p>
        </div>
        <form
          id="appointment-form"
          noValidate
          ref={formRef}
          onSubmit={handlePayAndBookSubmit}
        >
          <div className="form-grid">
            {/* Full Name */}
            <div className={`field full ${errors.fullName ? 'invalid' : ''}`}>
              <label htmlFor="fullName">Full name</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                autoComplete="name"
                value={formData.fullName}
                onChange={handleInputChange}
                aria-invalid={!!errors.fullName}
                aria-describedby="fullName-error"
                disabled={isBusy}
              />
              <p className="error-text" id="fullName-error">
                {errors.fullName}
              </p>
            </div>

            {/* Phone */}
            <div className={`field ${errors.phone ? 'invalid' : ''}`}>
              <label htmlFor="phone">Phone number</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                autoComplete="tel"
                placeholder="10-digit mobile number"
                inputMode="numeric"
                maxLength={10}
                value={formData.phone}
                onChange={handleInputChange}
                aria-invalid={!!errors.phone}
                aria-describedby="phone-error"
                disabled={isBusy}
              />
              <p className="error-text" id="phone-error">
                {errors.phone}
              </p>
            </div>

            {/* Email */}
            <div className={`field ${errors.email ? 'invalid' : ''}`}>
              <label htmlFor="email">Email address (for calendar invite)</label>
              <input
                type="email"
                id="email"
                name="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={formData.email}
                onChange={handleInputChange}
                aria-invalid={!!errors.email}
                aria-describedby="email-error"
                disabled={isBusy}
              />
              <p className="error-text" id="email-error">
                {errors.email}
              </p>
            </div>

            {/* Age */}
            <div className={`field ${errors.age ? 'invalid' : ''}`}>
              <label htmlFor="age">Age</label>
              <input
                type="number"
                id="age"
                name="age"
                min="1"
                max="120"
                inputMode="numeric"
                placeholder="e.g. 30"
                value={formData.age}
                onChange={handleInputChange}
                aria-invalid={!!errors.age}
                aria-describedby="age-error"
                disabled={isBusy}
              />
              <p className="error-text" id="age-error">
                {errors.age}
              </p>
            </div>

            {/* Reason */}
            <div className={`field ${errors.reason ? 'invalid' : ''}`}>
              <label htmlFor="reason">Reason for consultation</label>
              <select
                id="reason"
                name="reason"
                value={formData.reason}
                onChange={handleInputChange}
                aria-invalid={!!errors.reason}
                aria-describedby="reason-error"
                disabled={isBusy}
              >
                <option value="">Select a reason</option>
                <option>Piles (Bavasir / Mulvyadh)</option>
                <option>Fissure</option>
                <option>Fistula (Bhagandar)</option>
                <option>Pilonidal Sinus</option>
                <option>Stomach-Related Ailments</option>
                <option>Other / General Consultation</option>
              </select>
              <p className="error-text" id="reason-error">
                {errors.reason}
              </p>
            </div>

            {/* Unified Date & Time Scheduling Workspace (Side-by-Side to eliminate blank space) */}
            <div className="field full datetime-booking-workspace">
              <div className="datetime-booking-grid">
                {/* 1. Preferred Date Column (Interactive Calendar) */}
                <div
                  className={`datetime-col-calendar ${errors.date ? 'invalid' : ''}`}
                  ref={calendarSectionRef}
                >
                  <div className="calendar-field-header">
                    <label className="calendar-field-label">
                      Choose Preferred Date <span>(Mon to Sat)</span>
                    </label>
                    <p className="calendar-field-desc">
                      Select an available date from tomorrow onwards. Clinic closed on Sundays.
                    </p>
                  </div>

                  <CalendarPicker
                    selectedDate={formData.date}
                    onSelectDate={handleCalendarDateSelect}
                    minDate={tomorrowIso}
                    disabled={isBusy}
                    doctorBlockedDates={doctorBlockedDates}
                  />

                  <input type="hidden" name="date" value={formData.date} />

                  {errors.date && (
                    <p className="error-text" id="date-error" style={{ marginTop: '8px' }}>
                      {errors.date}
                    </p>
                  )}
                </div>

                {/* 2. Consultation Time Column (Available Time Slots) */}
                <div
                  className={`datetime-col-slots ${errors.time ? 'invalid' : ''}`}
                  ref={slotSectionRef}
                >
                  <input type="hidden" name="time" value={formData.time} />

                  <div className="slot-section">
                    <div className="slot-head">
                      <h3>Choose Consultation Time</h3>
                      <p>Clinic hours: 9:00 AM to 6:00 PM, Mon &ndash; Sat</p>
                    </div>

                    <p className="slot-date-note" id="slot-date-note">
                      {!formData.date
                        ? 'Select a date on the calendar to see available times.'
                        : tomorrowIso && formData.date < tomorrowIso
                        ? 'Same-day and past appointments cannot be booked online. Please select tomorrow or a later date.'
                        : isSunday
                        ? 'The clinic is closed on Sunday. Please choose another date.'
                        : isDoctorDateBlocked
                        ? `Dr. Mahesh Shete is unavailable on ${prettyDate} (${doctorBlockReason || 'Doctor on leave'}).`
                        : isLoadingSlots
                        ? 'Checking real-time calendar availability...'
                        : `Available times on ${prettyDate}`}
                    </p>

                    {tomorrowIso && formData.date && formData.date < tomorrowIso && (
                      <div className="notice-warning" style={{ marginTop: '10px' }}>
                        Appointments cannot be booked for current date or previous dates. Please select tomorrow or a later date.
                      </div>
                    )}

                    {isDoctorDateBlocked && (
                      <div className="notice-warning" style={{ marginTop: '10px' }}>
                        <strong>Doctor On Leave:</strong> Dr. Mahesh Shete is unavailable on this date ({doctorBlockReason || 'Doctor unavailable'}). Please select another date.
                      </div>
                    )}

                    {!isSunday && !isDoctorDateBlocked && formData.date && (!tomorrowIso || formData.date >= tomorrowIso) && (
                      <>
                        <div className="slot-grid" id="slot-grid">
                          {SLOTS.map((slot) => {
                            const isDoctorBlocked = doctorBlockedSlots.includes(slot.value);
                            const isBooked = serverBookedSlots.includes(slot.value);
                            const isUnavailable = isBooked || isDoctorBlocked;
                            const isSelected = formData.time === slot.value;
                            return (
                              <button
                                key={slot.value}
                                type="button"
                                className={`slot-btn ${
                                  isDoctorBlocked ? 'doctor-blocked' : isBooked ? 'booked' : 'open'
                                } ${isSelected ? 'selected' : ''}`}
                                disabled={isUnavailable || isBusy}
                                aria-label={
                                  isDoctorBlocked
                                    ? `${slot.label} (Doctor Unavailable)`
                                    : isBooked
                                    ? `${slot.label} (Booked)`
                                    : `${slot.label} (Available)`
                                }
                                onClick={() => handleSlotSelect(slot.value)}
                              >
                                <span className="slot-time">{slot.label}</span>
                                <span
                                  className={`slot-badge ${
                                    isDoctorBlocked
                                      ? 'badge-doctor-blocked'
                                      : isBooked
                                      ? 'badge-booked'
                                      : 'badge-open'
                                  }`}
                                >
                                  {isDoctorBlocked ? 'Unavailable' : isBooked ? 'Booked' : 'Available'}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="slot-legend">
                          <span className="legend-item">
                            <span className="legend-dot dot-open"></span> Available
                          </span>
                          <span className="legend-item">
                            <span className="legend-dot dot-booked"></span> Already Booked
                          </span>
                          <span className="legend-item">
                            <span className="legend-dot dot-leave"></span> Doctor Blocked
                          </span>
                          <span className="legend-item">
                            <span className="legend-dot dot-selected"></span> Selected
                          </span>
                        </div>
                      </>
                    )}

                    {/* Selected Date & Time Confirmation Banner */}
                    {formData.date && formData.time && !isSunday && (
                      <div className="selected-slot-banner" aria-live="polite">
                        <div className="slot-banner-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                        <div className="slot-banner-content">
                          <strong>Confirmed Selection:</strong>
                          <span>{prettyDate} at {selectedSlotLabel}</span>
                        </div>
                      </div>
                    )}

                    {errors.time && (
                      <p className="error-text" id="time-error" style={{ marginTop: '10px' }}>
                        {errors.time}
                      </p>
                    )}

                    <p className="slot-note" style={{ marginTop: '10px' }}>
                      Slots marked Booked are already reserved in the doctor&apos;s Google Calendar.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Message */}
            <div className={`field full ${errors.message ? 'invalid' : ''}`}>
              <label htmlFor="message">
                Message <span>(optional)</span>
              </label>
              <textarea
                id="message"
                name="message"
                maxLength={300}
                placeholder="Anything you would like the doctor to know before your visit"
                value={formData.message}
                onChange={handleInputChange}
                aria-describedby="message-error"
                disabled={isBusy}
              ></textarea>
              <p className="error-text" id="message-error">
                {errors.message}
              </p>
            </div>
          </div>

          {paymentError && (
            <div className="payment-error-banner" role="alert" style={{ marginTop: '16px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{paymentError}</span>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn" disabled={isBusy}>
              {isSubmitting
                ? 'Payment Successful! Booking Appointment...'
                : isProcessingPayment
                ? 'Opening Razorpay...'
                : isCheckingSlot
                ? 'Checking Slot...'
                : 'Pay 800 Rs & Book Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}