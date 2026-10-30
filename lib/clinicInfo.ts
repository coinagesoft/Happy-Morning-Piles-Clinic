/**
 * Single source of truth for clinic details.
 * Every value here comes from the clinic's own material
 * (posters, handwritten notes and website screenshots).
 * Edit here once and the whole site / emails / calendar invites / prescriptions update.
 */
export const CLINIC = {
  name: 'Happy Morning Piles Clinic',
  shortName: 'Happy Morning',
  tagline: 'Ayurvedic Injection Therapy Center',
  taglineMr: 'फक्त इंजेक्शन ने उपचार',
  taglineHi: 'बवासीर, भगन्दर, फिशर का बिना ऑपरेशन सुरक्षित इलाज',

  doctor: {
    name: 'Dr. Mahesh Shete',
    nameMr: 'डॉ. महेश शेटे',
    title: 'Piles & Fistula Specialist',
    titleMr: 'मूळव्याध आणि भगंदर तज्ञ',
  },

  phone: {
    display: '+91 70667 47811',
    tel: '+917066747811',
    digits: '917066747811',
  },

  address: {
    line1: '4th Floor, Ecorb Millinia Tower',
    line2: 'Vivek Nagar, Akurdi',
    line3: 'PCMC, Pune - 411035',
    full: '4th Floor, Ecorb Millinia Tower, Vivek Nagar, Akurdi, PCMC, Pune - 411035',
    landmark: 'Nigdi Flyover, Akurdi, PCMC, Pune',
    landmarkMr: 'निगडी फ्लाईओव्हर, आकुर्डी, पीसीएमसी, पुणे',
    area: 'Akurdi, PCMC, Pune',
    /** Google Maps listing for the clinic (opens the exact pin). */
    mapUrl:
      'https://www.google.com/maps/place/Happy+Morning+Piles+Clinic/@18.6565781,73.7767484,17z/data=!3m1!4b1!4m6!3m5!1s0x3bc2b90e4f574f25:0x69c29867eceb7f56!8m2!3d18.6565781!4d73.7793233!16s%2Fg%2F11zz1m2_ny',
  },

  logo: '/assets/happy-morning-logo-transparent.png',
  poster: '/assets/happy-morning-poster.jpg',
  banner: '/assets/happy-morning-banner.jpg',

  /** Shown wherever treatment is described (printed on the clinic's own poster). */
  advisory:
    'Consultation and treatment only by registered Ayurvedic practitioners. 100% Ayurvedic*. Treatment without surgery.',
  advisoryMr:
    'सल्ला व उपचार केवळ नोंदणीकृत आयुर्वेदिक वैद्यांकडून | 100% आयुर्वेदिक* | विना शस्त्रक्रिया उपचार',
} as const;

/** The 5 main symptoms listed on the clinic's Marathi/Hindi poster. */
export const FIVE_MAIN_SYMPTOMS = [
  { en: 'Bleeding', hi: 'खून आना' },
  { en: 'Lump near the anus', hi: 'गुदा के पास गांठ' },
  { en: 'Pain & burning', hi: 'दर्द व जलन' },
  { en: 'Itching', hi: 'खुजली' },
  { en: 'Difficulty passing stool', hi: 'शौच में तकलीफ' },
] as const;

/** Points printed on the clinic's injection-therapy sheet. */
export const INJECTION_POINTS = [
  'No cuts, no admission. Only OPD basis treatment',
  '100% Ayurvedic injection*',
  'Injection stops per-rectal bleeding',
  'Injection relieves per-rectal pain / burning',
  'No need of artificial dilation of the rectum',
  'Exotexture and elasticity of the anal canal is maintained',
  'No painful surgical or ksharsutra procedures',
  'No hard dietary restrictions needed',
  'No bed rest and no leave from routine work needed',
  'Scarless treatment',
] as const;