import Image from 'next/image';
import './article-cover.css';

type Props = {
  category: string;
  title?: string;
  size?: 'card' | 'hero';
};

/** Cover images live in /public/assets/news. Unknown categories fall back to the Piles cover. */
const COVERS: Record<string, string> = {
  Piles: '/assets/news/cover-piles.png',
  Fistula: '/assets/news/cover-fistula.png',
  Symptoms: '/assets/news/cover-symptoms.png',
  Treatment: '/assets/news/cover-treatment.png',
  Causes: '/assets/news/cover-causes.png',
  Fissure: '/assets/news/cover-fissure.png',
  Lifestyle: '/assets/news/cover-lifestyle.png',
  Pilonidal: '/assets/news/cover-pilonidal.png',
  Guidance: '/assets/news/cover-guidance.png',
  Visit: '/assets/news/cover-visit.png',
};

export default function ArticleCover({ category, title, size = 'card' }: Props) {
  const src = COVERS[category] ?? COVERS.Piles;
  return (
    <div className={`article-cover article-cover-img article-cover-${size}`}>
      <Image
        src={src}
        alt={title ?? `${category} article cover`}
        width={1600}
        height={870}
        sizes={size === 'hero' ? '(max-width: 900px) 100vw, 800px' : '(max-width: 900px) 100vw, 33vw'}
        className="article-cover-photo"
      />
    </div>
  );
}