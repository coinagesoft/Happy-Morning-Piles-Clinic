import { INJECTION_POINTS } from './clinicInfo';

export interface Treatment {
  id: string;
  name: string;
  localName: string;
  category: 'anorectal' | 'abdominal';
  badge: string;
  shortDesc: string;
  about: string;
  symptoms: string[];
  highlights: string[];
}

export const TREATMENTS: Treatment[] = [
  {
    id: 'piles',
    name: 'Piles (Haemorrhoids)',
    localName: 'बवासीर / मूळव्याध',
    category: 'anorectal',
    badge: 'Ayurvedic Injection Therapy',
    shortDesc:
      'Treatment of internal and external piles with an Ayurvedic* injection on an OPD basis. No cuts and no admission.',
    about:
      'Piles, also called haemorrhoids, are caused by bulging of the veins in the lower part of the anus and rectum. When the veins bulge, their walls get stretched, irritated and bleed. Piles are classified as internal and external: internal piles occur inside the anal canal and can sometimes grow and come out of the anus, while external piles grow at the very end of the anus.',
    symptoms: [
      'Bleeding while passing stool',
      'Lump near the anus',
      'Pain and burning',
      'Itching',
      'Difficulty passing stool',
    ],
    highlights: [...INJECTION_POINTS],
  },
  {
    id: 'fissure',
    name: 'Fissure',
    localName: 'फिशर',
    category: 'anorectal',
    badge: 'Without Operation',
    shortDesc:
      'Ayurvedic* injection-based treatment for anal fissure, without surgery and without hospital admission.',
    about:
      'An anal fissure is a small tear in the lining of the anal canal. It commonly causes sharp pain and burning while or after passing stool, and sometimes bleeding.',
    symptoms: [
      'Pain and burning while passing stool',
      'Bleeding',
      'Itching',
      'Difficulty passing stool',
    ],
    highlights: [
      'Only OPD basis treatment, no admission',
      'No cuts, no operation',
      'No bed rest or leave from routine work needed',
      'Scarless treatment',
    ],
  },
  {
    id: 'fistula',
    name: 'Fistula',
    localName: 'भगन्दर / भगंदर',
    category: 'anorectal',
    badge: 'Without Surgery, Laser or Ksharsutra',
    shortDesc:
      'Fistula treated with Ayurvedic* injection / applicators. About 20 minutes procedure, no hospital stay.',
    about:
      'There are different treatment options for anal fistula, depending on its severity. At Happy Morning Piles Clinic, fistula is treated without surgery, without laser and without ksharsutra, using Ayurvedic* injection / applicators. There is no need to stay in hospital; the procedure takes about 20 minutes.',
    symptoms: [
      'Pain and swelling near the anus',
      'Discharge or pus from an opening near the anus',
      'Itching and irritation',
      'Discomfort while sitting or passing stool',
    ],
    highlights: [
      'No surgery, no laser, no ksharsutra',
      'About 20 minutes procedure',
      'Only OPD basis treatment, no admission',
      'No stay in hospital',
    ],
  },
  {
    id: 'pilonidal-sinus',
    name: 'Pilonidal Sinus',
    localName: 'पायलोनाइडल साइनस',
    category: 'anorectal',
    badge: 'Anorectal Care',
    shortDesc:
      "Consultation and treatment for pilonidal sinus, one of the clinic's main treatments.",
    about:
      'A pilonidal sinus is a small channel or pocket in the skin near the top of the cleft between the buttocks. It can become painful, swollen or start to discharge. Consult Dr. Mahesh Shete for examination and a treatment plan.',
    symptoms: [
      'Pain or swelling near the tailbone',
      'Discharge from a small opening in the skin',
      'Tenderness while sitting',
    ],
    highlights: [
      'Examination by a piles & fistula specialist',
      'OPD basis consultation',
    ],
  },
  {
    id: 'stomach-ailments',
    name: 'Stomach-Related Ailments',
    localName: 'पेट से संबंधित बीमारियाँ',
    category: 'abdominal',
    badge: 'Ayurvedic Medicines',
    shortDesc:
      'Ayurvedic medicines for all stomach-related diseases, alongside anorectal care.',
    about:
      'Apart from piles, fissure and fistula, the clinic also treats stomach-related diseases with Ayurvedic medicines, combining modern techniques with Ayurveda.',
    symptoms: [
      'Constipation or difficulty passing stool',
      'Discomfort or pain in the abdomen',
    ],
    highlights: [
      'Treatment with Ayurvedic medicines',
      'Consultation by registered Ayurvedic practitioners',
    ],
  },
];
