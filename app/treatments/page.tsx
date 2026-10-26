'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { TREATMENTS } from '@/lib/treatmentsData';
import { NEWS_ARTICLES } from '@/lib/newsData';
import { CLINIC } from '@/lib/clinicInfo';
import '@/components/treatment-indepth.css';

export default function TreatmentsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredTreatments =
    selectedCategory === 'all'
      ? TREATMENTS
      : TREATMENTS.filter((t) => t.category === selectedCategory);

  // Open the in-depth guide when the page is opened with a link like /treatments#fistula
  useEffect(() => {
    const id = window.location.hash.replace('#', '');
    if (id && TREATMENTS.some((t) => t.id === id)) {
      setExpandedId(id);
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      {/* 1. PAGE HERO BANNER */}
      <section className="meditro-page-banner">
        <span className="deco-shape deco-hero-circle" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-plus" aria-hidden="true">+</span>

        <div className="container meditro-banner-inner">
          <span className="meditro-badge-orange">{CLINIC.tagline}</span>
          <h1>Piles, Fissure &amp; Fistula Treatments</h1>
          <p className="banner-subtext">
            Ayurvedic* injection therapy by {CLINIC.doctor.name}. No surgery, no admission, only OPD basis treatment.
          </p>

          <div className="meditro-breadcrumb">
            <Link href="/">
              <span>Home</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Treatments</span>
          </div>
        </div>

        <div className="hero-wave-bottom" aria-hidden="true">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 40C240 100 480 0 720 50C960 100 1200 15 1440 60V100H0V40Z" fill="#FFFFFF" />
          </svg>
        </div>
      </section>

      {/* 2. KEY POINTS BAR */}
      <section className="treatments-stats-bar">
        <div className="container">
          <div className="treatment-stats-grid">
            <div className="stat-card">
              <span className="stat-num">OPD</span>
              <strong>Only OPD Basis</strong>
              <small>No admission, no stay in hospital</small>
            </div>
            <div className="stat-card">
              <span className="stat-num">0</span>
              <strong>Cuts, Surgery or Laser</strong>
              <small>No operation and no ksharsutra</small>
            </div>
            <div className="stat-card">
              <span className="stat-num">20 Min</span>
              <strong>Procedure</strong>
              <small>No bed rest, no leave from routine work</small>
            </div>
            <div className="stat-card">
              <span className="stat-num">100%</span>
              <strong>Ayurvedic*</strong>
              <small>Scarless treatment</small>
            </div>
          </div>
        </div>
      </section>

      {/* 2b. KNOW THE DIFFERENCE */}
      <section className="meditro-section compare-section">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Know the Difference</span>
            <h2>Piles, Fissure or Fistula?</h2>
            <p className="section-lead-p">
              The three problems can feel alike. This table shows how they usually differ.
            </p>
          </div>

          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Piles</th>
                  <th>Fissure</th>
                  <th>Fistula</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>What it is</th>
                  <td>Swollen veins and cushions in the lower rectum and anus</td>
                  <td>A small tear in the lining of the anal canal</td>
                  <td>A tunnel between the anal canal and the skin</td>
                </tr>
                <tr>
                  <th>Typical pain</th>
                  <td>Often painless unless swollen or external</td>
                  <td>Sharp pain during and after stool, with burning</td>
                  <td>Pain and swelling that may ease when discharge comes out</td>
                </tr>
                <tr>
                  <th>Bleeding</th>
                  <td>Bright red, on paper, stool or in the bowl</td>
                  <td>A thin streak of blood</td>
                  <td>Blood-stained or pus discharge</td>
                </tr>
                <tr>
                  <th>Other signs</th>
                  <td>Lump near the anus, itching, a feeling of fullness</td>
                  <td>Fear of passing stool, constipation</td>
                  <td>An opening on the skin near the anus, repeated discharge</td>
                </tr>
                <tr>
                  <th>At this clinic</th>
                  <td>Ayurvedic* injection therapy, OPD, no cuts</td>
                  <td>Ayurvedic* injection-based, without operation</td>
                  <td>Ayurvedic* injection / applicators, about 20 minutes, no surgery, laser or ksharsutra</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="compare-note">
            This is a general guide. Only an examination can confirm which condition you have.
          </p>
        </div>
      </section>

      {/* 3. FILTER + TREATMENT CARDS */}
      <section className="meditro-section treatments-main-section" id="all-treatments">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Our Treatments</span>
            <h2>Explore What We Treat</h2>
            <p className="section-lead-p">
              Select a condition to read what it is, the common symptoms and how the clinic treats it.
            </p>
          </div>

          <div className="treatment-filter-pills" role="tablist" aria-label="Treatment categories">
            <button
              type="button"
              className={`filter-pill ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Treatments ({TREATMENTS.length})
            </button>
            <button
              type="button"
              className={`filter-pill ${selectedCategory === 'anorectal' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('anorectal')}
            >
              Piles, Fissure &amp; Fistula
            </button>
            <button
              type="button"
              className={`filter-pill ${selectedCategory === 'abdominal' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('abdominal')}
            >
              Stomach Ailments
            </button>
          </div>

          <div className="treatment-cards-list">
            {filteredTreatments.map((treatment) => {
              const isExpanded = expandedId === treatment.id;

              return (
                <article key={treatment.id} id={treatment.id} className="treatment-detail-card">
                  <div className="treatment-card-header">
                    <div className="treatment-title-block">
                      <span className="treatment-badge-tag">{treatment.badge}</span>
                      <h3>
                        {treatment.name} <span lang="hi">({treatment.localName})</span>
                      </h3>
                      <p className="treatment-short-desc">{treatment.shortDesc}</p>
                    </div>

                    <div className="treatment-header-cta">
                      <Link href="/appointment" className="btn-meditro-orange btn-book-treatment">
                        Book Appointment
                      </Link>
                    </div>
                  </div>

                  <div className="treatment-clinical-grid">
                    <div className="clinical-col constitutional-col">
                      <h4>What is it?</h4>
                      <p>{treatment.about}</p>
                    </div>

                    <div className="clinical-col suppression-col">
                      <h4>Common symptoms</h4>
                      <ul>
                        {treatment.symptoms.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="treatment-expanded-drawer indepth-drawer">
                      <figure className="indepth-figure">
                        <Image
                          src={treatment.image.src}
                          alt={treatment.image.alt}
                          width={1600}
                          height={900}
                          sizes="(max-width: 900px) 100vw, 900px"
                        />
                        <figcaption>{treatment.image.caption}</figcaption>
                      </figure>

                      <div className="indepth-block">
                        <h5>Understanding {treatment.name.split('(')[0].trim()}</h5>
                        {treatment.overview.map((para) => (
                          <p key={para}>{para}</p>
                        ))}
                      </div>

                      {treatment.types && (
                        <div className="indepth-types">
                          <h5>Types and stages</h5>
                          <div className="indepth-types-grid">
                            {treatment.types.map((t) => (
                              <div key={t.title} className="indepth-type-card">
                                <strong>{t.title}</strong>
                                <p>{t.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="indepth-two-col">
                        <div className="indepth-col">
                          <h5>Common causes</h5>
                          <ul>
                            {treatment.causes.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="indepth-col">
                          <h5>Simple care at home</h5>
                          <ul>
                            {treatment.selfCare.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="indepth-alert">
                        <h5>When to see a doctor</h5>
                        <ul>
                          {treatment.whenToSeeDoctor.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="indepth-steps">
                        <h5>What to expect at the clinic</h5>
                        <ol>
                          {treatment.whatToExpect.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                      </div>

                      <div className="expanded-highlights">
                        <h5>Treatment highlights:</h5>
                        <ul>
                          {treatment.highlights.map((h) => (
                            <li key={h}>
                              <span className="check-icon">&#x2713;</span>
                              {h}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="indepth-faqs">
                        <h5>Quick questions</h5>
                        {treatment.faqs.map((f) => (
                          <details key={f.q} className="indepth-faq-item">
                            <summary>{f.q}</summary>
                            <p>{f.a}</p>
                          </details>
                        ))}
                      </div>

                      <div className="indepth-related">
                        <h5>Read more</h5>
                        <div className="indepth-related-links">
                          {treatment.relatedGuides
                            .map((slug) => NEWS_ARTICLES.find((a) => a.slug === slug))
                            .filter((a): a is (typeof NEWS_ARTICLES)[number] => Boolean(a))
                            .map((a) => (
                              <Link key={a.slug} href={`/news/${a.slug}`}>
                                {a.title}
                              </Link>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="treatment-card-footer">
                    <button
                      type="button"
                      className="btn-toggle-treatment"
                      onClick={() => toggleExpand(treatment.id)}
                      aria-expanded={isExpanded}
                    >
                      <span>{isExpanded ? 'Hide In-Depth Guide' : 'Read In-Depth Guide'}</span>
                      <span className={`toggle-chevron ${isExpanded ? 'rotated' : ''}`}>&#x25BC;</span>
                    </button>

                    <div className="footer-links-group">
                      <Link href="/appointment" className="btn-treatment-direct-book">
                        Book for {treatment.name.split('(')[0].trim()} &rarr;
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="section-lead-p" style={{ textAlign: 'center', marginTop: '28px' }}>
            {CLINIC.advisory}
          </p>
        </div>
      </section>

      {/* 3b. YOUR VISIT */}
      <section className="meditro-section visit-steps-section">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Your Visit</span>
            <h2>How Treatment Works, Step by Step</h2>
          </div>
          <figure className="visit-steps-figure">
            <Image
              src="/assets/diagrams/infographic-your-visit.png"
              alt="Four steps: book, examination, treatment plan and OPD treatment"
              width={1600}
              height={900}
              sizes="(max-width: 1200px) 100vw, 1200px"
            />
          </figure>
        </div>
      </section>

      {/* 4. FAQ (answers only use facts from the clinic's own material) */}
      <section className="meditro-section treatments-faq-section">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Patient Questions</span>
            <h2>Frequently Asked Questions</h2>
          </div>

          <div className="faq-cards-grid">
            <div className="faq-card">
              <h4>Do I need to be admitted to hospital?</h4>
              <p>
                No. Treatment is only on an OPD basis. There is no admission and no stay in hospital.
              </p>
            </div>

            <div className="faq-card">
              <h4>Is there any cut or surgery?</h4>
              <p>
                No cuts. Piles, fissure and fistula are treated with Ayurvedic* injection therapy, without surgery. Fistula is treated without surgery, laser or ksharsutra.
              </p>
            </div>

            <div className="faq-card">
              <h4>How long does the procedure take?</h4>
              <p>
                The procedure takes about 20 minutes.
              </p>
            </div>

            <div className="faq-card">
              <h4>Do I need bed rest or leave from work?</h4>
              <p>
                No bed rest and no leave from routine work are needed, and there are no hard dietary restrictions.
              </p>
            </div>

            <div className="faq-card">
              <h4>Where is the clinic?</h4>
              <p>
                {CLINIC.address.full}. Call {CLINIC.phone.display} for directions.
              </p>
            </div>

            <div className="faq-card">
              <h4>Is rectal bleeding always piles?</h4>
              <p>
                Not necessarily. Bleeding can have other causes, so please get examined by {CLINIC.doctor.name} or another doctor to confirm the cause before starting treatment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. BOTTOM CTA */}
      <section className="treatments-bottom-cta">
        <div className="container">
          <div className="treatments-cta-box">
            <h2>Suffering From Piles, Fissure or Fistula?</h2>
            <p>
              Consult {CLINIC.doctor.name}, {CLINIC.doctor.title}, at {CLINIC.name}, {CLINIC.address.area}.
            </p>
            <div className="cta-actions">
              <Link href="/appointment" className="btn-meditro-orange">
                Book Appointment
              </Link>
              <a href={`tel:${CLINIC.phone.tel}`} className="btn-meditro-outline-white">
                Call Clinic: {CLINIC.phone.display}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}