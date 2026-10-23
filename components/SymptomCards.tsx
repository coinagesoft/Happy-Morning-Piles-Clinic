'use client';

import { useEffect, useRef, useState } from 'react';
import { FIVE_MAIN_SYMPTOMS } from '@/lib/clinicInfo';
import './symptom-cards.css';

/** Icon files in /public/assets/symptom-icons, in the same order as FIVE_MAIN_SYMPTOMS. */
const ICONS = [
  '01-bleeding',
  '02-lump',
  '03-pain-burning',
  '04-itching',
  '05-difficulty-stool',
] as const;

export default function SymptomCards() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [visible, setVisible] = useState<boolean[]>(() =>
    FIVE_MAIN_SYMPTOMS.map(() => false)
  );

  // Reveal each card the first time it scrolls into view.
  useEffect(() => {
    const reveal = (index: number) =>
      setVisible((prev) => (prev[index] ? prev : prev.map((v, i) => (i === index ? true : v))));

    if (typeof IntersectionObserver === 'undefined') {
      FIVE_MAIN_SYMPTOMS.forEach((_, i) => reveal(i));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          reveal(Number((entry.target as HTMLElement).dataset.index));
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -40px 0px' }
    );

    cardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="process-cards-grid symptoms-cards-grid">
      {/* If JavaScript is off, never leave the cards hidden. */}
      <noscript>
        <style>{'.sc-card.sc-pending{opacity:1!important;transform:none!important}'}</style>
      </noscript>

      {FIVE_MAIN_SYMPTOMS.map((sym, i) => (
        <div
          key={sym.en}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          data-index={i}
          className={`process-card sc-card ${visible[i] ? 'sc-in' : 'sc-pending'}`}
          style={{ ['--sc-delay' as string]: `${(i % 3) * 120}ms` }}
        >
          <div className="sc-top">
            <div className="sc-icon" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/symptom-icons/${ICONS[i]}.svg`} alt="" width={46} height={46} />
            </div>
            <div className="process-num sc-num">{String(i + 1).padStart(2, '0')}</div>
          </div>

          <div className="sc-body">
            <h3>{sym.en}</h3>
            <p lang="hi">{sym.hi}</p>
          </div>
        </div>
      ))}
    </div>
  );
}