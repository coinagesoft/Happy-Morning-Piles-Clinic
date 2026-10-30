/**
 * Clinic team shown on the About page.
 * Edit here once to update names, photos, credentials and short intros.
 */
export type TeamMember = {
  slug: string;
  name: string;
  role: string;
  photo: string;
  /** Shown as small badges on the card */
  credentials: string[];
  /** Short intro shown on the card */
  summary: string;
};

export const TEAM: TeamMember[] = [
  {
    slug: 'sumed-madan',
    name: 'Dr. Sumed Madan',
    role: 'Ayurvedic Proctologist',
    photo: '/assets/doctors/dr-sumed-madan.jpg',
    credentials: ['BAMS', 'Ayurvedic Proctology'],
    summary:
      'Provides holistic, root-cause care for piles, fissures and fistulas, combining Ayurvedic principles with modern diagnostics and complete confidentiality.',
  },
  {
    slug: 'aamer-shaikh',
    name: 'Dr. Aamer Shaikh',
    role: 'Proctologist & Emergency Medicine Specialist',
    photo: '/assets/doctors/dr-aamer-shaikh.jpg',
    credentials: ['BAMS', 'PGDEMS (Ruby Hall)', 'CCH', 'CVD', 'CSD'],
    summary:
      'Offers compassionate, minimally invasive care for anorectal conditions with precise clinical judgement and absolute patient confidentiality.',
  },
  {
    slug: 'rushikesh',
    name: 'Dr. Rushikesh',
    role: 'Proctologist & Emergency Medicine Specialist',
    photo: '/assets/doctors/dr-rushikesh.jpg',
    credentials: ['BHMS', 'Emergency & Critical Care'],
    summary:
      'Experienced in multispeciality hospital emergency care, skilled in treating acute pain and bleeding with private, patient-centric care.',
  },
  {
    slug: 'shubham-pisal',
    name: 'Dr. Shubham Pisal',
    role: 'Ayurvedic Proctologist',
    photo: '/assets/doctors/dr-shubham-pisal.jpg',
    credentials: ['BAMS', 'Ayurvedic Proctology'],
    summary:
      'Brings multispeciality hospital experience to the management of painful anorectal conditions, with comfort, privacy and minimally invasive treatment.',
  },
  {
    slug: 'saachi-karanjikar',
    name: 'Dr. Saachi Karanjikar',
    role: 'Neuro Physiotherapist',
    photo: '/assets/doctors/dr-saachi-karanjikar.jpg',
    credentials: ['MPT (Neuro)', 'BPT'],
    summary:
      'Helps patients restore mobility, relieve pain and regain strength through personalised, evidence-based rehabilitation.',
  },
];