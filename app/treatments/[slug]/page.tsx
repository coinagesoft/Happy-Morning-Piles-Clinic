import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { TREATMENTS } from '@/lib/treatmentsData';
import { NEWS_ARTICLES } from '@/lib/newsData';
import { CLINIC } from '@/lib/clinicInfo';
import '@/components/treatment-indepth.css';

interface TreatmentDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return TREATMENTS.map((t) => ({ slug: t.id }));
}

export async function generateMetadata({ params }: TreatmentDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const treatment = TREATMENTS.find((t) => t.id === slug);
  if (!treatment) return { title: 'Treatment Not Found' };

  return {
    title: `${treatment.name.split('(')[0].trim()} In-Depth Guide | Happy Morning Piles Clinic`,
    description: treatment.shortDesc,
  };
}

export default async function TreatmentDetailPage({ params }: TreatmentDetailPageProps) {
  const { slug } = await params;
  const treatment = TREATMENTS.find((t) => t.id === slug);

  if (!treatment) {
    notFound();
  }

  const shortName = treatment.name.split('(')[0].trim();

  const relatedArticles = treatment.relatedGuides
    .map((s) => NEWS_ARTICLES.find((a) => a.slug === s))
    .filter((a): a is (typeof NEWS_ARTICLES)[number] => Boolean(a));

  const otherTreatments = TREATMENTS.filter((t) => t.id !== treatment.id);

  return (
    <>
      {/* 1. PAGE HERO BANNER */}
      <section className="meditro-page-banner">
        <span className="deco-shape deco-hero-circle" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-plus" aria-hidden="true">+</span>

        <div className="container meditro-banner-inner">
          <span className="meditro-badge-orange">{treatment.badge}</span>
          <h1>
            {treatment.name} <span lang="hi">({treatment.localName})</span>
          </h1>
          <p className="banner-subtext">{treatment.shortDesc}</p>

          <div className="meditro-breadcrumb">
            <Link href="/">
              <span>Home</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <Link href="/treatments">
              <span>Treatments</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{shortName}</span>
          </div>
        </div>

        <div className="hero-wave-bottom" aria-hidden="true">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 40C240 100 480 0 720 50C960 100 1200 15 1440 60V100H0V40Z" fill="#FFFFFF" />
          </svg>
        </div>
      </section>

      {/* 2. IN-DEPTH GUIDE */}
      <section className="meditro-section indepth-page-section">
        <div className="container indepth-page-container">
          <div className="indepth-page-topbar">
            <Link href="/treatments" className="indepth-back-link">
              &larr; Back to all treatments
            </Link>
            <Link href="/appointment" className="btn-meditro-orange">
              Book Appointment
            </Link>
          </div>

          <div className="indepth-drawer">
            <figure className="indepth-figure">
              <Image
                src={treatment.image.src}
                alt={treatment.image.alt}
                width={1600}
                height={900}
                sizes="(max-width: 900px) 100vw, 900px"
                priority
              />
              <figcaption>{treatment.image.caption}</figcaption>
            </figure>

            <div className="indepth-block">
              <h2 className="indepth-h">Understanding {shortName}</h2>
              {treatment.overview.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>

            {treatment.types && (
              <div className="indepth-types">
                <h2 className="indepth-h">Types and stages</h2>
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
                <h2 className="indepth-h">Common causes</h2>
                <ul>
                  {treatment.causes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              <div className="indepth-col">
                <h2 className="indepth-h">Simple care at home</h2>
                <ul>
                  {treatment.selfCare.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="indepth-alert">
              <h2 className="indepth-h">When to see a doctor</h2>
              <ul>
                {treatment.whenToSeeDoctor.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>

            <div className="indepth-steps">
              <h2 className="indepth-h">What to expect at the clinic</h2>
              <ol>
                {treatment.whatToExpect.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>

            <div className="expanded-highlights">
              <h2 className="indepth-h">Treatment highlights:</h2>
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
              <h2 className="indepth-h">Quick questions</h2>
              {treatment.faqs.map((f) => (
                <details key={f.q} className="indepth-faq-item">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>

            {relatedArticles.length > 0 && (
              <div className="indepth-related">
                <h2 className="indepth-h">Read more</h2>
                <div className="indepth-related-links">
                  {relatedArticles.map((a) => (
                    <Link key={a.slug} href={`/news/${a.slug}`}>
                      {a.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="section-lead-p" style={{ textAlign: 'center', marginTop: '28px' }}>
            {CLINIC.advisory}
          </p>

          {/* Other guides */}
          <div className="indepth-other-guides">
            <h2 className="indepth-h">Other treatment guides</h2>
            <div className="indepth-related-links">
              {otherTreatments.map((t) => (
                <Link key={t.id} href={`/treatments/${t.id}`}>
                  {t.name.split('(')[0].trim()}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. BOTTOM CTA */}
      <section className="treatments-bottom-cta">
        <div className="container">
          <div className="treatments-cta-box">
            <h2>Need help with {shortName}?</h2>
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