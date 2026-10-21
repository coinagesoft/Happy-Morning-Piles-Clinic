import ArticleCover from '@/components/ArticleCover';
import Link from 'next/link';
import type { Metadata } from 'next';
import { NEWS_ARTICLES } from '@/lib/newsData';

export const metadata: Metadata = {
  title: 'Health Guides on Piles, Fissure & Fistula',
  description: 'Simple guides on piles, fissure, fistula and Ayurvedic injection therapy from Happy Morning Piles Clinic, Akurdi, PCMC, Pune.',
};

export default function NewsIndexPage() {
  return (
    <>
      {/* Page Hero Banner */}
      <section className="meditro-page-banner">
        <span className="deco-shape deco-hero-circle" aria-hidden="true"></span>
        <span className="deco-shape deco-hero-plus" aria-hidden="true">+</span>

        <div className="container meditro-banner-inner">
          <span className="meditro-badge-orange">Health Guides</span>
          <h1>Health Guides &amp; Information</h1>
          <p className="banner-subtext">
            Plain-language information on piles, fissure, fistula and Ayurvedic injection therapy from Happy Morning Piles Clinic.
          </p>

          <div className="meditro-breadcrumb">
            <Link href="/">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home</span>
            </Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">News &amp; Insights</span>
          </div>
        </div>

        <div className="hero-wave-bottom" aria-hidden="true">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M0 40C240 100 480 0 720 50C960 100 1200 15 1440 60V100H0V40Z" fill="#FFFFFF" />
          </svg>
        </div>
      </section>

      {/* Main Articles Listing */}
      <section className="meditro-section news-directory-section">
        <div className="container">
          <div className="meditro-section-header">
            <span className="meditro-badge-orange">Featured Guides</span>
            <h2>Know Your Condition Before You Visit</h2>
            <p className="section-lead-p">
              Read about the symptoms, types and treatment approach for common anorectal conditions.
            </p>
          </div>

          <div className="news-cards-grid news-directory-grid">
            {NEWS_ARTICLES.map((article) => (
              <article key={article.slug} className="meditro-news-card news-page-card">
                <Link href={`/news/${article.slug}`} className="news-card-img-link" tabIndex={-1}>
                  <div className="news-card-img">
                    <ArticleCover category={article.category} title={article.title} />
                    <span className="news-category-badge">{article.category}</span>
                  </div>
                </Link>

                <div className="news-card-body">
                  <div className="news-meta-row">
                    <span className="news-read-time">{article.readTime}</span>
                  </div>

                  <h3>
                    <Link href={`/news/${article.slug}`} className="news-title-link">
                      {article.title}
                    </Link>
                  </h3>

                  <p className="news-card-summary">
                    {article.summary}
                  </p>

                    <div className="news-card-bottom">
                    <Link href={`/news/${article.slug}`} className="btn-news-more">
                      <span>Read Full Article</span>
                      <span className="news-arrow-box" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Consultation CTA Banner */}
          <div className="news-page-cta-card">
            <div>
              <h3>Have Questions About Your Symptoms?</h3>
              <p>Consult Dr. Mahesh Shete, Piles &amp; Fistula Specialist, at Happy Morning Piles Clinic, Akurdi.</p>
            </div>
            <Link href="/appointment" className="btn-meditro-orange">
              Book Appointment
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}