'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { NEWS_ARTICLES, NewsArticle } from '@/lib/newsData';

export default function NewsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [slideStep, setSlideStep] = useState(0);

  const total = NEWS_ARTICLES.length;
  // Clone the first 4 articles to the end for seamless continuous looping (3 cards visible in view + buffer)
  const displayArticles: NewsArticle[] = [
    ...NEWS_ARTICLES,
    ...NEWS_ARTICLES.slice(0, 4),
  ];

  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Measure exact slide step (slide width + gap) directly from layout
  const updateStep = useCallback(() => {
    if (trackRef.current && trackRef.current.children.length >= 2) {
      const firstSlide = trackRef.current.children[0] as HTMLElement;
      const computed = window.getComputedStyle(trackRef.current);
      const gap = parseFloat(computed.gap) || 28;
      const step = firstSlide.offsetWidth + gap;
      if (step > 0) {
        setSlideStep(step);
      }
    }
  }, []);

  // Update step on mount and dynamically on viewport resize
  useEffect(() => {
    updateStep();
    if (!viewportRef.current) return;

    const ro = new ResizeObserver(() => {
      updateStep();
    });
    ro.observe(viewportRef.current);

    window.addEventListener('resize', updateStep);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateStep);
    };
  }, [updateStep]);

  // Scroll forward by 1 news item
  const nextSlide = useCallback(() => {
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1);
  }, []);

  // Scroll backward by 1 news item
  const prevSlide = useCallback(() => {
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  }, [total]);

  // Direct dot click navigation
  const goToSlide = (idx: number) => {
    setIsTransitioning(true);
    setCurrentIndex(idx);
  };

  // Autoscroll timer: advances by 1 news card every 4.5 seconds
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      nextSlide();
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, nextSlide]);

  // When transition finishes at the boundary (index >= total), seamlessly snap back to index 0
  const handleTransitionEnd = () => {
    if (currentIndex >= total) {
      setIsTransitioning(false);
      setCurrentIndex(0);
    }
  };

  // Safety timer to ensure index resets even if onTransitionEnd is deferred by browser
  useEffect(() => {
    if (currentIndex >= total) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setCurrentIndex(0);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, total]);

  // Mobile swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 45) {
      nextSlide();
    } else if (diff < -45) {
      prevSlide();
    }
    touchStartX.current = null;
  };

  // Active indicator dot (0 to 5)
  const activeDot = currentIndex % total;

  return (
    <div
      className="news-carousel-root"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-label="Clinical News Carousel"
    >
      {/* 3 News Cards in One View - Glides by 1 card on scroll */}
      <div className="news-slider-viewport" ref={viewportRef}>
        <div
          ref={trackRef}
          className="news-slider-track"
          style={{
            transform: `translateX(-${currentIndex * slideStep}px)`,
            transition: isTransitioning
              ? 'transform 0.55s cubic-bezier(0.25, 1, 0.5, 1)'
              : 'none',
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {displayArticles.map((article, idx) => (
            <div
              key={`${article.slug}-${idx}`}
              className="news-slider-slide"
              aria-hidden={idx < currentIndex || idx >= currentIndex + 3}
            >
              <article className="meditro-news-card news-carousel-card">
                <Link
                  href={`/news/${article.slug}`}
                  className="news-card-img-link"
                  tabIndex={idx >= currentIndex && idx < currentIndex + 3 ? 0 : -1}
                >
                  <div className="news-card-img">
                    <Image
                      src={article.image}
                      alt={article.title}
                      width={500}
                      height={320}
                      unoptimized
                      style={{ objectFit: 'contain', background: '#fff' }}
                      className="news-thumb-img"
                    />
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
                    <Link
                      href={`/news/${article.slug}`}
                      className="btn-news-more"
                      tabIndex={idx >= currentIndex && idx < currentIndex + 3 ? 0 : -1}
                    >
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
            </div>
          ))}
        </div>
      </div>

      {/* Clean Dot Indicators Below (Click to jump to any article) */}
      <div className="news-carousel-dots" role="tablist" aria-label="Article slides">
        {NEWS_ARTICLES.map((item, idx) => (
          <button
            key={item.slug}
            type="button"
            role="tab"
            aria-selected={idx === activeDot}
            className={`carousel-dot ${idx === activeDot ? 'dot-active' : ''}`}
            onClick={() => goToSlide(idx)}
            aria-label={`Jump to article ${idx + 1}: ${item.title}`}
          />
        ))}
      </div>
    </div>
  );
}
