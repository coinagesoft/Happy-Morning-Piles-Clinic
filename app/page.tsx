import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import NewsCarousel from '@/components/NewsCarousel';
import { CLINIC, FIVE_MAIN_SYMPTOMS } from '@/lib/clinicInfo';

export const metadata: Metadata = {
  title: 'Happy Morning Piles Clinic | Piles, Fissure & Fistula Treatment in Akurdi, PCMC, Pune',
  description: 'Ayurvedic* injection therapy for piles, fissure, fistula and pilonidal sinus with Dr. Mahesh Shete. No cuts, no admission, only OPD basis treatment. 4th Floor, Ecorb Millinia Tower, Vivek Nagar, Akurdi, PCMC.',
};

export default function HomePage() {
  return (
    <>
      {/* =========================================================
          1. HERO SECTION (MediTro Wavy Lavender Hero)
         ========================================================= */}
      <section className="meditro-hero">
        {/* Floating Decorative Shapes */}
        <span className="deco-shape deco-hero-circle" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-square" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-plus" aria-hidden="true">+</span>
        <span className="deco-shape deco-hero-triangle" aria-hidden="true"></span>

        <div className="container meditro-hero-grid">
          <div className="meditro-hero-copy">
            <span className="meditro-badge-blue">
              {CLINIC.tagline}
            </span>
            <h1>
              Piles, Fissure &amp; Fistula Treatment Without Operation
            </h1>
            <p className="meditro-hero-lead">
              {CLINIC.doctor.name}, {CLINIC.doctor.title}. 100% Ayurvedic* injection therapy on an OPD basis: no cuts, no admission, no hospital stay.
            </p>
            <p className="meditro-hero-lead" lang="mr" style={{ fontWeight: 700 }}>
              {CLINIC.doctor.titleMr} &bull; {CLINIC.taglineMr}
            </p>
            <div className="meditro-hero-actions">
              <Link href="/appointment" className="btn-meditro-orange">
                Book Appointment
              </Link>
              <Link href="/treatments" className="btn-meditro-outline">
                Our Treatments
              </Link>
              <a href={`tel:${CLINIC.phone.tel}`} className="btn-meditro-outline">
                Call {CLINIC.phone.display}
              </a>
            </div>
          </div>

          <div className="meditro-hero-visual">
            <div className="hero-organic-backing">
              <Image
                src={CLINIC.logo}
                alt="Happy Morning Piles Clinic logo"
                width={952}
                height={952}
                priority
                unoptimized
                className="hero-doctor-img"
                style={{ aspectRatio: '1 / 1', objectFit: 'contain', background: '#fff', borderRadius: '50%', marginBottom: '20px' }}
              />
            </div>
            <span className="deco-waves-orange" aria-hidden="true">
              &#x2248;&#x2248;&#x2248;
            </span>
          </div>
        </div>

        {/* Bottom Wavy SVG Divider */}
        <div className="hero-wave-bottom" aria-hidden="true">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path
              d="M0 50C240 120 480 0 720 60C960 120 1200 20 1440 70V120H0V50Z"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      </section>

      {/* =========================================================
          2. ABOUT US SECTION (Elaborated Profile + Experience)
         ========================================================= */}
      <section className="meditro-section meditro-about">
        <span className="deco-shape deco-about-square-left" aria-hidden="true"></span>
        <span className="deco-shape deco-about-square-right" aria-hidden="true"></span>

        <div className="container meditro-about-grid">
          {/* Left: 2x2 Asymmetric Collage */}
          <div className="about-collage-wrap">
            <div className="collage-item collage-tl">
              <Image
                src={CLINIC.banner}
                alt="Happy Morning Piles Clinic treatments: piles, fissure, fistula and pilonidal sinus"
                width={1109}
                height={1090}
                unoptimized
                style={{ objectFit: 'contain', background: '#fff' }}
              />
            </div>
            <div className="collage-item collage-tr">
              <Image
                src={CLINIC.logo}
                alt="Happy Morning Piles Clinic logo"
                width={952}
                height={952}
                unoptimized
                style={{ objectFit: 'contain', padding: '10px' }}
              />
            </div>
            <div className="collage-item collage-bl">
              <Image
                src={CLINIC.poster}
                alt="Only injection therapy, no operation, no admission"
                width={720}
                height={1280}
                unoptimized
                style={{ objectFit: 'contain', background: '#fff' }}
              />
            </div>
            <div className="collage-item collage-exp-card">
              <strong>OPD</strong>
              <span>No Admission &bull; No Cuts</span>
            </div>
            <span className="collage-center-diamond" aria-hidden="true"></span>
          </div>

          {/* Right: Elaborated Profile Summary */}
          <div className="about-content-wrap">
            <span className="meditro-badge-orange">About {CLINIC.name}</span>
            <h2>Piles &amp; Fistula Care, Clearly Explained</h2>
            <p className="credential-pill">
              {CLINIC.doctor.name} &bull; {CLINIC.doctor.title}
            </p>
            <p>
              {CLINIC.name} is an Ayurvedic injection therapy center in {CLINIC.address.area}. The clinic treats piles, fissure, fistula and pilonidal sinus without operation and without admission, combining modern techniques with Ayurveda.
            </p>
            <p style={{ marginTop: '10px' }}>
              Treatment is on an OPD basis, with no hard dietary restrictions, no bed rest and no need to take leave from routine work.
            </p>

            <div className="about-features-grid">
              <div className="about-feature-pill">
                <span className="feature-icon-box icon-cyan" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </span>
                <strong>Only OPD Basis</strong>
              </div>

              <div className="about-feature-pill">
                <span className="feature-icon-box icon-green" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <polyline points="17 11 19 13 23 9" />
                  </svg>
                </span>
                <strong>No Cuts, No Admission</strong>
              </div>

              <div className="about-feature-pill">
                <span className="feature-icon-box icon-pink" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </span>
                <strong>100% Ayurvedic*</strong>
              </div>

              <div className="about-feature-pill">
                <span className="feature-icon-box icon-purple" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.5 20.5 10 22l-4-2.5L2 17l1.5-.5" />
                    <path d="m14 6 4 4" />
                    <path d="m17 3 4 4" />
                    <path d="M19 5 9 15l-4 1 1-4L16 2z" />
                  </svg>
                </span>
                <strong>Scarless Treatment</strong>
              </div>
            </div>

            <div className="about-actions-group">
              <Link href="/about" className="btn-meditro-blue">
                About the Clinic &rarr;
              </Link>
              {/* <Link href="/appointment" className="btn-meditro-orange">
                Book Visit
              </Link> */}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          3. WORKING PROCESS SECTION ("How we works?" 01 / 02 / 03)
         ========================================================= */}
      <section className="meditro-section meditro-process" id="process">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Working Process</span>
            <h2>How Treatment Works</h2>
          </div>

          <div className="process-cards-grid">
            {/* Step 01 */}
            <div className="process-card">
              <div className="process-num">01</div>
              <h3>Make Appointment</h3>
              <p>
                Choose your preferred date and an available slot online, or call the clinic on {CLINIC.phone.display}.
              </p>
              <Link href="/appointment" className="btn-process-link">
                <span>Book Slot</span>
                <span className="process-arrow-box" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </Link>
            </div>

            {/* Step 02 (Active Orange Center Card) */}
            <div className="process-card process-card-active">
              <div className="process-num">02</div>
              <h3>Examination &amp; Consultation</h3>
              <p>
                Meet {CLINIC.doctor.name} to discuss your symptoms and get examined, so the right treatment can be planned for you.
              </p>
              <Link href="/about" className="btn-process-link">
                <span>About the Clinic</span>
                <span className="process-arrow-box" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </Link>
            </div>

            {/* Step 03 */}
            <div className="process-card">
              <div className="process-num">03</div>
              <h3>Injection Therapy</h3>
              <p>
                Ayurvedic* injection therapy on an OPD basis. No admission, no bed rest and no hard dietary restrictions.
              </p>
              <Link href="/treatments" className="btn-process-link">
                <span>View Treatments</span>
                <span className="process-arrow-box" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          4. TREATMENTS SECTION (Renamed from Services & linked to /treatments)
         ========================================================= */}
      <section className="meditro-section meditro-services" id="treatments">
        <div className="services-blue-backdrop" aria-hidden="true"></div>

        <div className="container meditro-services-grid">
          {/* Left Copy */}
          <div className="services-intro-col">
            <span className="meditro-badge-orange">Our Treatments</span>
            <h2>Treatments We Offer</h2>
            <p>
              Ayurvedic* injection therapy for piles, fissure, fistula and pilonidal sinus, plus Ayurvedic medicines for stomach-related ailments.
            </p>
            <div className="treatment-intro-actions">
              <Link href="/treatments" className="btn-meditro-orange">
                Explore All Treatments &rarr;
              </Link>
              {/* <Link href="/appointment" className="btn-treatment-consult">
                Book Consultation
              </Link> */}
            </div>
          </div>

          {/* Right Treatment Cards */}
          <div className="services-cards-row">
            <article className="meditro-service-card">
              <div className="service-icon-frame">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
                  <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                  <circle cx="20" cy="10" r="2" />
                </svg>
              </div>
              <span className="card-cat-badge">Anorectal</span>
              <h3>Piles (बवासीर)</h3>
              <p>Internal and external piles treated with Ayurvedic* injection therapy. No cuts and no admission.</p>
              <Link href="/treatments#piles" className="btn-service-more">
                Treatment Details &rarr;
              </Link>
            </article>

            <article className="meditro-service-card">
              <div className="service-icon-frame">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.5 20.5 10 22l-4-2.5L2 17l1.5-.5" />
                  <path d="m14 6 4 4" />
                  <path d="M19 5 9 15l-4 1 1-4L16 2z" />
                </svg>
              </div>
              <span className="card-cat-badge">Anorectal</span>
              <h3>Fissure (फिशर)</h3>
              <p>Treatment of anal fissure without operation, on an OPD basis.</p>
              <Link href="/treatments#fissure" className="btn-service-more">
                Treatment Details &rarr;
              </Link>
            </article>

            <article className="meditro-service-card">
              <div className="service-icon-frame">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <line x1="12" y1="9" x2="12" y2="15" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                </svg>
              </div>
              <span className="card-cat-badge">Anorectal</span>
              <h3>Fistula (भगन्दर)</h3>
              <p>No surgery, no laser, no ksharsutra. About 20 minutes procedure with no hospital stay.</p>
              <Link href="/treatments#fistula" className="btn-service-more">
                Treatment Details &rarr;
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* =========================================================
          5. MAIN SYMPTOMS
         ========================================================= */}
      <section className="meditro-section meditro-testimonials" id="symptoms">
        <span className="deco-shape deco-testi-plus" aria-hidden="true">+</span>
        <span className="deco-shape deco-testi-circle" aria-hidden="true"></span>

        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Symptoms</span>
            <h2>Troubled by Piles, Fissure or Fistula?</h2>
            <p className="section-lead-p" lang="mr">
              मूळव्याध आणि फिशर चा त्रास आहे का? &bull; बवासीर, फिशर और भगंदर से परेशान हैं?
            </p>
          </div>

          <div className="process-cards-grid">
            {FIVE_MAIN_SYMPTOMS.map((sym, i) => (
              <div key={sym.en} className={`process-card${i === 1 ? ' process-card-active' : ''}`}>
                <div className="process-num">{String(i + 1).padStart(2, '0')}</div>
                <h3>{sym.en}</h3>
                <p lang="hi">{sym.hi}</p>
              </div>
            ))}
          </div>

          <p className="section-lead-p" style={{ textAlign: 'center', marginTop: '28px' }}>
            Rectal bleeding can have more than one cause, so please get examined before assuming it is piles.
          </p>
        </div>
      </section>

      {/* =========================================================
          6. LATEST NEWS & INSIGHTS (Auto-Scroll Carousel View)
         ========================================================= */}
      <section className="meditro-section meditro-news" id="news">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Health Guides</span>
            <h2>Learn About Your Condition</h2>
            <p className="section-lead-p">
              Simple guides on piles, fissure, fistula and Ayurvedic injection therapy.
            </p>
          </div>

          {/* Interactive Auto-Scroll News Carousel Component */}
          <NewsCarousel />

          <div className="news-browse-all-row">
            <Link href="/news" className="btn-meditro-blue">
              Browse All Guides &rarr;
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
