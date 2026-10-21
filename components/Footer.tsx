import Link from 'next/link';
import Image from 'next/image';
import { CLINIC } from '@/lib/clinicInfo';

export default function Footer() {
  return (
    <footer className="meditro-footer" id="contact">
      {/* Wavy Top Divider */}
      <div className="footer-wave-top" aria-hidden="true">
        <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path
            d="M0 40C240 100 480 0 720 40C960 80 1200 10 1440 50V100H0V40Z"
            fill="#F3F4FF"
          />
          <path
            d="M0 40C240 100 480 0 720 40C960 80 1200 10 1440 50"
            stroke="#DCDEFE"
            strokeWidth="3"
            fill="none"
          />
        </svg>
      </div>

      <div className="footer-main-wrap">
        {/* Decorative Floating Shapes */}
        <span className="deco-shape deco-footer-plus" aria-hidden="true">+</span>
        <span className="deco-shape deco-footer-circle" aria-hidden="true"></span>

        <div className="container footer-grid-meditro">
          {/* Column 1: Brand & Orange Phone Callout */}
          <div className="footer-col-brand">
            <Link href="/" className="brand-meditro">
              <span className="brand-logo-icon" aria-hidden="true">
                <Image src={CLINIC.logo} alt="" width={44} height={44} unoptimized style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </span>
              <span className="brand-text-wrap">
                <strong>{CLINIC.shortName}</strong>
                <small>Piles Clinic</small>
              </span>
            </Link>

            <p className="footer-about-text">
              {CLINIC.tagline}. Piles, fissure and fistula treatment without operation and without admission, by {CLINIC.doctor.name}.
            </p>

            <div className="footer-contact-callout">
              <span className="contact-callout-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
              <div className="contact-callout-info">
                <span>Contact Us</span>
                <a href={`tel:${CLINIC.phone.tel}`}>{CLINIC.phone.display}</a>
              </div>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="footer-col-links">
            <h3 className="footer-col-title">Quick Links</h3>
            <div className="footer-title-wave" aria-hidden="true"></div>
            <ul>
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/treatments">Our Treatments</Link></li>
              <li><Link href="/news">Health Guides</Link></li>
              <li><Link href="/appointment">Book Appointment</Link></li>
              <li><Link href="/#process">How Treatment Works</Link></li>
              <li><Link href="/admin">Doctor Admin Portal</Link></li>
            </ul>
          </div>

          {/* Column 3: Our Treatments */}
          <div className="footer-col-links">
            <h3 className="footer-col-title">Our Treatments</h3>
            <div className="footer-title-wave" aria-hidden="true"></div>
            <ul>
              <li><Link href="/treatments#piles">Piles (बवासीर)</Link></li>
              <li><Link href="/treatments#fissure">Fissure (फिशर)</Link></li>
              <li><Link href="/treatments#fistula">Fistula (भगन्दर)</Link></li>
              <li><Link href="/treatments#pilonidal-sinus">Pilonidal Sinus</Link></li>
              <li><Link href="/treatments#stomach-ailments">Stomach Ailments</Link></li>
            </ul>
          </div>

          {/* Column 4: Clinic Visit & Subscribe */}
          <div className="footer-col-subscribe">
            <h3 className="footer-col-title">Visit Clinic</h3>
            <div className="footer-title-wave" aria-hidden="true"></div>

            <div className="footer-clinic-card">
              <p>
                <strong>Address:</strong> {CLINIC.address.full}
              </p>
              <p>
                <strong>Doctor:</strong> {CLINIC.doctor.name}, {CLINIC.doctor.title}
              </p>
              <p>
                <strong>Phone:</strong>{' '}
                <a href={`tel:${CLINIC.phone.tel}`}>{CLINIC.phone.display}</a>
              </p>
            </div>

            <Link href="/appointment" className="btn-meditro-orange footer-cta-btn">
              Book Appointment Now
            </Link>

            <div className="footer-social-row">
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC.address.full)}`} target="_blank" rel="noopener noreferrer" aria-label="Clinic Location" className="social-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </a>
              
              <a href={`tel:${CLINIC.phone.tel}`} aria-label="Call Clinic" className="social-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </a>
              <Link href="/admin" aria-label="Doctor Admin Portal" className="social-pill" title="Doctor Admin Portal">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="container footer-bottom-meditro">
          <p>
            Copyright &copy; 2026{' '}
            <strong>{CLINIC.name}</strong>. {CLINIC.advisory}
          </p>
        </div>
      </div>
    </footer>
  );
}
