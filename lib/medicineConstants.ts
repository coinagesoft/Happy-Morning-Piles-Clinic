export interface MedicineCategory {
  id: string;
  name: string;
  description: string;
  medicineCount: number;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_MEDICINE_CATEGORIES: Array<{ name: string; description: string }> = [
  {
    name: 'Piles & Haemorrhoids',
    description: 'Internal & external piles, bleeding piles, venous congestion, and rectal fullness',
  },
  {
    name: 'Fissure & Fistula',
    description: 'Anal fissures, burning rectal pain, anal fistulae, perianal abscesses & suppuration',
  },
  {
    name: 'Constipation & Bowel Health',
    description: 'Chronic constipation, sluggish bowels, hard dry stools, and ineffectual stool urging',
  },
  {
    name: 'Digestive & Gastric',
    description: 'Hyperacidity, dyspepsia, heartburn, flatulence, bloating, and liver remedies',
  },
  {
    name: 'Trauma & Injury',
    description: 'Soreness, blunt physical trauma, bruises, lacerations, and post-procedure healing',
  },
  {
    name: 'Acute & Febrile',
    description: 'Sudden onset fever, chills, inflammatory reactions, and acute restiveness',
  },
  {
    name: 'Respiratory & Sinus',
    description: 'Coughs, nasal catarrh, sinus congestion, bronchitis, and throat complaints',
  },
  {
    name: 'Constitutional',
    description: 'Deep-acting constitutional polychrests suited to holistic patient temperament',
  },
  {
    name: 'Emotional & Nervous',
    description: 'Anxiety, stress, sleeplessness, restlessness, and psychosomatic tension',
  },
  {
    name: 'Skin & Allergies',
    description: 'Pruritus ani, eczema, hives, allergic eruptions, and rectal itching',
  },
  {
    name: 'Musculoskeletal / Joints',
    description: 'Rheumatic pains, lumbago, stiffness, back strain, and pelvic soreness',
  },
  {
    name: 'Biochemic Tissue Salt',
    description: 'Schuessler 12 essential mineral cell salts for cellular deficiency and repair',
  },
  {
    name: 'Polycrest',
    description: 'Broad-spectrum remedies with wide therapeutic scope across multiple body systems',
  },
  {
    name: 'Pediatric',
    description: 'Gentle remedies formulated for infants, children, and sensitive individuals',
  },
  {
    name: 'General',
    description: 'General therapeutic support and tonics',
  },
];

