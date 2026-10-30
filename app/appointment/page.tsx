import type { Metadata } from 'next';
import Link from 'next/link';
import AppointmentForm from '@/components/AppointmentForm';
import { CLINIC } from '@/lib/clinicInfo';

export const metadata: Metadata = {
  title: 'Book an Appointment',
  description: 'Book an appointment with Dr. Mahesh Shete at Happy Morning Piles Clinic, Akurdi, PCMC, Pune.',
};

export default function AppointmentPage() {
  return (
    <>
      {/* MediTro Wavy Page Banner */}
      <section className="meditro-page-banner">
        <span className="deco-shape deco-hero-circle" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-plus" aria-hidden="true">+</span>
        <div className="container meditro-banner-inner">
          <h1>Book An Appointment</h1>
          <div className="meditro-breadcrumb">
            <Link href="/">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Booking</span>
          </div>
        </div>
        <div className="hero-wave-bottom" aria-hidden="true">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 40C240 100 480 0 720 50C960 100 1200 15 1440 60V100H0V40Z" fill="#FFFFFF" />
          </svg>
        </div>
      </section>

      {/* Booking workspace: fits one desktop screen (date -> time -> details) */}
      <section className="bk-screen">
        <div className="container">
          <AppointmentForm />
        </div>
      </section>

      {/* Info that used to sit beside the form now lives below it */}
      <section className="bk-info-section">
        <div className="container bk-info-grid">
          <div className="clinic-card bk-clinic-card">
            <span className="meditro-badge-orange" style={{ marginBottom: '12px' }}>
              Clinic Info
            </span>
            <h2>Happy Morning Piles Clinic</h2>
            <div className="bk-clinic-rows">
              <div className="info-item">
                <span>Address</span>
                <p>
                  {CLINIC.address.line1}
                  <br />
                  {CLINIC.address.line2}
                  <br />
                  {CLINIC.address.line3}
                </p>
              </div>
              <div className="info-item">
                <span>Phone</span>
                <p>
                  <a href={`tel:${CLINIC.phone.tel}`}>{CLINIC.phone.display}</a>
                </p>
              </div>
              <div className="info-item">
                <span>Landmark</span>
                <p>{CLINIC.address.landmark}</p>
              </div>
            </div>
          </div>

          <div className="aside-trust-card bk-trust-card">
            <h3>What&apos;s Included</h3>
            <ul className="aside-trust-list">
              <li>
                <span className="trust-check">✓</span>
                <div>
                  <strong>One-to-One Consultation</strong>
                  <p>Examination and treatment plan by {CLINIC.doctor.name}</p>
                </div>
              </li>
              <li>
                <span className="trust-check">✓</span>
                <div>
                  <strong>In-Clinic or Online</strong>
                  <p>Clinic visit at Akurdi, PCMC or a Google Meet link</p>
                </div>
              </li>
              <li>
                <span className="trust-check">✓</span>
                <div>
                  <strong>Prescription After Your Visit</strong>
                  <p>Delivered to your email and WhatsApp after visit</p>
                </div>
              </li>
              <li>
                <span className="trust-check">✓</span>
                <div>
                  <strong>Patient Privacy</strong>
                  <p>Your details are used only for your appointment</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="bk-info-stack">
            <div className="aside-note">
              <strong>Before your visit</strong>
              <p>
                Please keep any relevant medical reports and details of current medication ready for your consultation.
              </p>
            </div>

            <div className="aside-help-card">
              <div className="help-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="help-text-wrap">
                <strong>Need Assistance Booking?</strong>
                <p>Call the clinic for scheduling support.</p>
                <a href={`tel:${CLINIC.phone.tel}`} className="help-call-link">
                  {CLINIC.phone.display}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}