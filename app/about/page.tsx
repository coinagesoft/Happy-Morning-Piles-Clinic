import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CLINIC } from '@/lib/clinicInfo';

export const metadata: Metadata = {
  title: 'About the Clinic | Happy Morning Piles Clinic, Akurdi, PCMC, Pune',
  description:
    'Happy Morning Piles Clinic is an Ayurvedic injection therapy center in Akurdi, PCMC, Pune. Dr. Mahesh Shete treats piles, fissure, fistula and pilonidal sinus on an OPD basis.',
};

export default function AboutPage() {
  return (
    <>
      {/* Page Banner */}
      <section className="meditro-page-banner">
        <span className="deco-shape deco-hero-circle" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-plus" aria-hidden="true">+</span>
        <div className="container meditro-banner-inner">
          <span className="meditro-badge-orange">{CLINIC.tagline}</span>
          <h1>About {CLINIC.name}</h1>
          <p className="banner-subtext">
            {CLINIC.doctor.name} &bull; {CLINIC.doctor.title} &bull; {CLINIC.address.area}
          </p>

          <div className="meditro-breadcrumb">
            <Link href="/">
              <span>Home</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">About</span>
          </div>
        </div>

        <div className="hero-wave-bottom" aria-hidden="true">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 40C240 100 480 0 720 50C960 100 1200 15 1440 60V100H0V40Z" fill="#FFFFFF" />
          </svg>
        </div>
      </section>

      {/* Clinic & Doctor Profile */}
      <section className="meditro-section about-doctor-section">
        <div className="container meditro-about-grid">
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
          </div>

          <div className="about-content-wrap">
            <span className="meditro-badge-orange">Our Doctor</span>
            <h2>{CLINIC.doctor.name}</h2>
            <div className="credential-badge-row">
              <span className="cred-badge">{CLINIC.doctor.title}</span>
              <span className="cred-badge" lang="mr">{CLINIC.doctor.titleMr}</span>
            </div>

            <p className="about-profile-lead">
              {CLINIC.name} is an Ayurvedic injection therapy center in {CLINIC.address.area}, offering a safe treatment for piles (बवासीर), fissure (फिशर), fistula (भगन्दर) and pilonidal sinus without operation.
            </p>

            <p>
              The clinic brings together modern techniques and Ayurveda. Treatment is done on an OPD basis with no cuts, no admission and no stay in hospital, so you can return to your routine without bed rest or leave from work.
            </p>

            <div style={{ marginTop: '24px' }}>
              <Link href="/appointment" className="btn-meditro-orange">
                Book Appointment with {CLINIC.doctor.name}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What the clinic stands for */}
      <section className="meditro-section about-philosophy-section">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Our Approach</span>
            <h2>What You Can Expect</h2>
            <p className="section-lead-p">
              Ayurvedic* injection therapy designed to be simple, safe and convenient for the patient.
            </p>
          </div>

          <div className="philosophy-cards-grid">
            <div className="philosophy-card">
              <div className="philo-icon-box">01</div>
              <h3>No Cuts, No Admission</h3>
              <p>
                Only OPD basis treatment. There is no need for admission or a hospital stay.
              </p>
            </div>

            <div className="philosophy-card philo-card-highlight">
              <div className="philo-icon-box">02</div>
              <h3>100% Ayurvedic Injection*</h3>
              <p>
                Piles, fissure and fistula are treated with an Ayurvedic* injection, without surgery, laser or ksharsutra.
              </p>
            </div>

            <div className="philosophy-card">
              <div className="philo-icon-box">03</div>
              <h3>Back to Routine Quickly</h3>
              <p>
                No hard dietary restrictions, no bed rest and no leave from routine work needed. The procedure takes about 20 minutes.
              </p>
            </div>

            <div className="philosophy-card">
              <div className="philo-icon-box">04</div>
              <h3>Scarless Treatment</h3>
              <p>
                The elasticity of the anal canal is maintained, with no need of artificial dilation of the rectum.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Visit the clinic */}
      <section className="meditro-section about-accreditations-section">
        <div className="container">
          <div className="accreditations-box">
            <div className="accred-left">
              <span className="meditro-badge-blue">Visit Us</span>
              <h3>{CLINIC.name}</h3>
              <ul className="accred-list">
                <li>
                  <span className="accred-check">&#x2713;</span>
                  <div>
                    <strong>Address</strong>
                    <span>{CLINIC.address.full}</span>
                  </div>
                </li>
                <li>
                  <span className="accred-check">&#x2713;</span>
                  <div>
                    <strong>Phone</strong>
                    <span><a href={`tel:${CLINIC.phone.tel}`}>{CLINIC.phone.display}</a></span>
                  </div>
                </li>
                <li>
                  <span className="accred-check">&#x2713;</span>
                  <div>
                    <strong>Landmark</strong>
                    <span>{CLINIC.address.landmark}</span>
                  </div>
                </li>
              </ul>
            </div>

            <div className="accred-right-card">
              <h4>{CLINIC.doctor.name}</h4>
              <p>{CLINIC.doctor.title}</p>
              <small>{CLINIC.advisory}</small>

              <div style={{ marginTop: '20px' }}>
                <Link href="/appointment" className="btn-meditro-orange" style={{ width: '100%', textAlign: 'center' }}>
                  Book An Appointment
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Treatments Teaser */}
      <section className="meditro-section about-treatments-teaser">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Specialized Care</span>
            <h2>Conditions We Treat</h2>
          </div>

          <div className="about-teaser-cards-grid">
            <div className="teaser-card">
              <h4>Piles (बवासीर)</h4>
              <p>Internal and external piles treated with Ayurvedic* injection therapy on an OPD basis.</p>
              <Link href="/treatments#piles" className="teaser-link">Learn Treatment &rarr;</Link>
            </div>
            <div className="teaser-card">
              <h4>Fissure (फिशर)</h4>
              <p>Treatment of anal fissure without operation and without admission.</p>
              <Link href="/treatments#fissure" className="teaser-link">Learn Treatment &rarr;</Link>
            </div>
            <div className="teaser-card">
              <h4>Fistula (भगन्दर)</h4>
              <p>No surgery, no laser, no ksharsutra. About 20 minutes procedure.</p>
              <Link href="/treatments#fistula" className="teaser-link">Learn Treatment &rarr;</Link>
            </div>
            <div className="teaser-card">
              <h4>Pilonidal Sinus</h4>
              <p>Examination and treatment planning for pilonidal sinus.</p>
              <Link href="/treatments#pilonidal-sinus" className="teaser-link">Learn Treatment &rarr;</Link>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '36px' }}>
            <Link href="/treatments" className="btn-meditro-blue">
              View All Treatments &rarr;
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
