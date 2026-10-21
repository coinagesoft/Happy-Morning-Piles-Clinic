import React from 'react';

type Props = {
  category: string;
  title?: string;
  size?: 'card' | 'hero';
};

const THEMES: Record<string, { cls: string; icon: React.ReactNode }> = {
  Piles: {
    cls: 'cover-piles',
    icon: (
      <path d="M12 2.5c3.4 4.3 6 7.3 6 10.7a6 6 0 0 1-12 0c0-3.4 2.6-6.4 6-10.7z" />
    ),
  },
  Fistula: {
    cls: 'cover-fistula',
    icon: (
      <>
        <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6L12 3z" />
        <path d="M12 8.5v6M9 11.5h6" />
      </>
    ),
  },
  Symptoms: {
    cls: 'cover-symptoms',
    icon: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  },
  Treatment: {
    cls: 'cover-treatment',
    icon: (
      <>
        <path d="M18 2l4 4M20 4l-9 9M14 8l2 2" />
        <path d="M11 13l-5.5 5.5M3 21l2.5-2.5M8 10l6 6-4.5 4.5a2.1 2.1 0 0 1-3 0l-3-3a2.1 2.1 0 0 1 0-3L8 10z" />
      </>
    ),
  },
};

export default function ArticleCover({ category, title, size = 'card' }: Props) {
  const theme = THEMES[category] ?? THEMES.Piles;
  return (
    <div className={`article-cover ${theme.cls} article-cover-${size}`} role="img" aria-label={title ?? category}>
      <span className="article-cover-ring article-cover-ring-1" aria-hidden="true" />
      <span className="article-cover-ring article-cover-ring-2" aria-hidden="true" />
      <div className="article-cover-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="100%"
          height="100%"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {theme.icon}
        </svg>
      </div>
      <div className="article-cover-label">Happy Morning Piles Clinic</div>
    </div>
  );
}
