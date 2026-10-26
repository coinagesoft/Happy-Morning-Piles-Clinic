import Image from 'next/image';
import ArticleCover from '@/components/ArticleCover';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NEWS_ARTICLES } from '@/lib/newsData';
import { CLINIC } from '@/lib/clinicInfo';
import '@/components/article-rich.css';

interface NewsDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return NEWS_ARTICLES.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: NewsDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = NEWS_ARTICLES.find((a) => a.slug === slug);
  if (!article) return { title: 'Article Not Found' };

  return {
    title: `${article.title} | Happy Morning Piles Clinic`,
    description: article.summary,
  };
}

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { slug } = await params;
  const article = NEWS_ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    notFound();
  }

  const relatedArticles = NEWS_ARTICLES.filter((a) =>
    article.relatedSlugs.includes(a.slug)
  );

  return (
    <>
      {/* Article Page Hero Banner */}
      <section className="meditro-page-banner article-page-banner">
        <span className="deco-shape deco-hero-circle" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-plus" aria-hidden="true">+</span>

        <div className="container meditro-banner-inner article-banner-inner">
          <div className="article-top-meta">
            <span className="article-category-pill">{article.category}</span>
            <span className="article-meta-dot">&bull;</span>
            <span className="article-read-time">{article.readTime}</span>
          </div>

          <h1 className="article-main-title">{article.title}</h1>

          <div className="meditro-breadcrumb">
            <Link href="/">
              <span>Home</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <Link href="/news">
              <span>News</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{article.category}</span>
          </div>
        </div>

        <div className="hero-wave-bottom" aria-hidden="true">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 40C240 100 480 0 720 50C960 100 1200 15 1440 60V100H0V40Z" fill="#FFFFFF" />
          </svg>
        </div>
      </section>

      {/* Article Main Body Section */}
      <section className="meditro-section article-content-section">
        <div className="container article-layout-grid">
          {/* Main Article Column */}
          <main className="article-main-col">
            {/* Featured Image */}
            <div className="article-featured-image-wrap">
              <ArticleCover category={article.category} title={article.title} size="hero" />
              <div className="featured-img-caption">
                Happy Morning Piles Clinic, Akurdi, PCMC, Pune
              </div>
            </div>

            {/* Key Takeaways Box */}
            <div className="key-takeaways-box">
              <div className="takeaways-header">
                <span className="takeaways-icon">&#x2728;</span>
                <h3>Key Takeaways</h3>
              </div>
              <ul className="takeaways-list">
                {article.keyTakeaways.map((point, idx) => (
                  <li key={idx}>
                    <span className="bullet-point">&#x2714;</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Rich Article Sections */}
            <div className="article-body-content">
              {article.contentSections.map((section, idx) => (
                <div key={idx} className="article-section-block">
                  <h2>{section.heading}</h2>

                  {section.image && (
                    <figure className="article-figure">
                      <Image
                        src={section.image.src}
                        alt={section.image.alt}
                        width={1600}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 800px"
                        className="article-figure-img"
                      />
                      {section.image.caption && (
                        <figcaption>{section.image.caption}</figcaption>
                      )}
                    </figure>
                  )}

                  {section.paragraphs.map((p, pIdx) => (
                    <p key={pIdx}>{p}</p>
                  ))}

                  {section.bullets && section.bullets.length > 0 && (
                    <ul className="article-bullets">
                      {section.bullets.map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>
                  )}

                  {section.steps && section.steps.length > 0 && (
                    <ol className="article-steps">
                      {section.steps.map((s, sIdx) => (
                        <li key={sIdx}>{s}</li>
                      ))}
                    </ol>
                  )}

                  {section.callout && (
                    <aside className="article-callout-card" aria-label="Clinical highlight">
                      <div className="callout-quote-icon">&ldquo;</div>
                      <p>{section.callout}</p>
                    </aside>
                  )}
                </div>
              ))}
            </div>

            {/* FAQs */}
            {article.faqs && article.faqs.length > 0 && (
              <section className="article-faq-block" aria-label="Frequently asked questions">
                <h2>Frequently Asked Questions</h2>
                {article.faqs.map((f, i) => (
                  <details key={i} className="article-faq-item">
                    <summary>{f.q}</summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </section>
            )}

            {/* Disclaimer */}
            <p className="article-disclaimer">
              This guide is for general information and is not a substitute for a medical examination.
              {' '}{CLINIC.advisory}
            </p>

            {/* Navigation back to all articles */}
            <div className="article-bottom-nav">
              <Link href="/news" className="btn-back-to-news">
                &larr; Back to All Guides
              </Link>
              <Link href="/treatments" className="btn-browse-treatments">
                Explore Related Treatments &rarr;
              </Link>
            </div>
          </main>

          {/* Sidebar Column */}
          <aside className="article-sidebar-col">
            {/* Clinic Card */}
            <div className="sidebar-widget author-card-widget">
              <div className="author-widget-header">
                <Image
                  src={CLINIC.logo}
                  alt={CLINIC.name}
                  width={90}
                  height={90}
                  unoptimized
                  className="author-avatar"
                />
                <div>
                  <h4>{CLINIC.doctor.name}</h4>
                  <span className="author-credentials">{CLINIC.doctor.title}</span>
                </div>
              </div>
              <p className="author-bio-snippet">
                {CLINIC.name}, {CLINIC.address.area}. {CLINIC.tagline}.
              </p>
              <Link href="/about" className="author-full-profile-link">
                About the Clinic &rarr;
              </Link>
            </div>

            {/* Book Consultation Widget */}
            <div className="sidebar-widget cta-widget">
              <span className="cta-widget-badge">Book a Visit</span>
              <h3>Need Help With This Condition?</h3>
              <p>
                Consult {CLINIC.doctor.name} at {CLINIC.name}, {CLINIC.address.area}.
              </p>
              <ul className="cta-perks-list">
                <li>&#x2713; OPD basis treatment, no admission</li>
                <li>&#x2713; No cuts, no operation</li>
                <li>&#x2713; No bed rest needed</li>
              </ul>
              <Link href="/appointment" className="btn-meditro-orange btn-sidebar-book">
                Book Appointment
              </Link>
              <a href={`tel:${CLINIC.phone.tel}`} className="sidebar-phone-link">
                Call: {CLINIC.phone.display}
              </a>
            </div>

            {/* Related Articles Widget */}
            {relatedArticles.length > 0 && (
              <div className="sidebar-widget related-articles-widget">
                <h4 className="sidebar-widget-title">Related Guides</h4>
                <div className="related-list">
                  {relatedArticles.map((rel) => (
                    <article key={rel.slug} className="mini-related-item">
                      <Link href={`/news/${rel.slug}`}>
                        <span className="mini-category">{rel.category}</span>
                        <h5>{rel.title}</h5>
                        <small>{rel.readTime}</small>
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}