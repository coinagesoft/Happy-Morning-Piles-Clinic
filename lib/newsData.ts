import { CLINIC, FIVE_MAIN_SYMPTOMS, INJECTION_POINTS } from './clinicInfo';

export interface NewsArticle {
  slug: string;
  title: string;
  category: string;
  readTime: string;
  image: string;
  summary: string;
  keyTakeaways: string[];
  contentSections: {
    heading: string;
    paragraphs: string[];
    callout?: string;
  }[];
  relatedSlugs: string[];
}

export const NEWS_ARTICLES: NewsArticle[] = [
  {
    slug: 'what-are-piles',
    title: 'What Are Piles (Haemorrhoids)? Causes, Types and Symptoms',
    category: 'Piles',
    readTime: '3 min read',
    image: CLINIC.poster,
    summary:
      'Piles, also called haemorrhoids, are caused by bulging veins in the lower part of the anus and rectum. Learn the two types and the main symptoms to look out for.',
    keyTakeaways: [
      'Piles are bulging veins in the lower anus and rectum',
      'They are classified as internal or external',
      'Bleeding, lumps, pain and itching are the common signs',
    ],
    contentSections: [
      {
        heading: 'What happens in piles?',
        paragraphs: [
          'Piles, also called haemorrhoids, are caused as a result of bulging of veins in the lower part of the anus and rectum. When the veins bulge, the walls of the veins get stretched, irritated and bleed.',
        ],
      },
      {
        heading: 'Internal and external piles',
        paragraphs: [
          'Piles are classified into internal and external types. Internal piles occur inside the anal canal. They can grow and come out of the anus at times. External piles grow at the very end of the anus.',
        ],
      },
      {
        heading: 'Main symptoms',
        paragraphs: [
          `The five main symptoms are: ${FIVE_MAIN_SYMPTOMS.map((s) => s.en.toLowerCase()).join(', ')}.`,
        ],
        callout:
          'Rectal bleeding can have more than one cause. Please get examined by a doctor instead of assuming it is piles.',
      },
    ],
    relatedSlugs: ['symptoms-piles-fissure-fistula', 'injection-therapy-opd-treatment'],
  },
  {
    slug: 'understanding-anal-fistula',
    title: 'Understanding Anal Fistula and Your Treatment Options',
    category: 'Fistula',
    readTime: '3 min read',
    image: CLINIC.banner,
    summary:
      'There are different treatment options for anal fistula depending on its severity. Here is how the clinic treats it without surgery, laser or ksharsutra.',
    keyTakeaways: [
      'Treatment options depend on the severity of the fistula',
      'No surgery, no laser and no ksharsutra at this clinic',
      'About 20 minutes procedure with no hospital stay',
    ],
    contentSections: [
      {
        heading: 'Treatment depends on severity',
        paragraphs: [
          'There are different treatment options for anal fistula, depending on the severity of the condition. A proper examination is the first step.',
        ],
      },
      {
        heading: 'Treatment at Happy Morning Piles Clinic',
        paragraphs: [
          'Fistula is treated without surgery, without laser and without ksharsutra, using Ayurvedic* injection / applicators.',
          'There is no need to stay in hospital. The procedure takes about 20 minutes and is done on an OPD basis.',
        ],
      },
    ],
    relatedSlugs: ['injection-therapy-opd-treatment', 'symptoms-piles-fissure-fistula'],
  },
  {
    slug: 'symptoms-piles-fissure-fistula',
    title: '5 Main Symptoms of Piles, Fissure and Fistula',
    category: 'Symptoms',
    readTime: '2 min read',
    image: CLINIC.poster,
    summary:
      'Bleeding, a lump near the anus, pain and burning, itching and difficulty passing stool are the five main symptoms to watch for.',
    keyTakeaways: [
      'Five main symptoms are common to anorectal problems',
      'Do not ignore bleeding during stool',
      'Consult early for examination and a treatment plan',
    ],
    contentSections: [
      {
        heading: 'The five main symptoms',
        paragraphs: FIVE_MAIN_SYMPTOMS.map((s) => `${s.en} (${s.hi})`),
        callout:
          'Symptoms overlap between piles, fissure and fistula, so an examination is needed to know which condition you have.',
      },
      {
        heading: 'When to visit the clinic',
        paragraphs: [
          `If you notice any of these symptoms, call ${CLINIC.phone.display} or book an appointment online with ${CLINIC.doctor.name}.`,
        ],
      },
    ],
    relatedSlugs: ['what-are-piles', 'understanding-anal-fistula'],
  },
  {
    slug: 'injection-therapy-opd-treatment',
    title: 'Ayurvedic Injection Therapy: What to Expect on an OPD Basis',
    category: 'Treatment',
    readTime: '3 min read',
    image: CLINIC.banner,
    summary:
      'No cuts, no admission, no bed rest. A look at how Ayurvedic* injection therapy for piles is carried out at the clinic.',
    keyTakeaways: [
      'Only OPD basis treatment, no admission needed',
      'No hard dietary restrictions and no bed rest',
      'Scarless treatment',
    ],
    contentSections: [
      {
        heading: 'What the therapy involves',
        paragraphs: [
          'Happy Morning Piles Clinic offers Ayurvedic* injection therapy for piles. The treatment is done on an OPD basis, with no cuts and no admission.',
        ],
      },
      {
        heading: 'Points to know',
        paragraphs: [...INJECTION_POINTS],
        callout: `${CLINIC.advisory}`,
      },
    ],
    relatedSlugs: ['what-are-piles', 'understanding-anal-fistula'],
  },
];
