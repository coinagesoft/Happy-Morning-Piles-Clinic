import { INJECTION_POINTS } from "./clinicInfo";

export interface TreatmentImage {
  src: string;
  alt: string;
  caption: string;
}

export interface Treatment {
  id: string;
  name: string;
  localName: string;
  category: "anorectal" | "abdominal";
  badge: string;
  shortDesc: string;
  about: string;
  symptoms: string[];
  highlights: string[];

  /* ---- in-depth content (shown under "Read In-Depth Guide") ---- */
  image: TreatmentImage;
  overview: string[];
  types?: { title: string; text: string }[];
  causes: string[];
  selfCare: string[];
  whenToSeeDoctor: string[];
  whatToExpect: string[];
  faqs: { q: string; a: string }[];
  /** slugs of related articles in lib/newsData.ts */
  relatedGuides: string[];
}

const DIAGRAMS = "/assets/diagrams";

export const TREATMENTS: Treatment[] = [
  {
    id: "piles",
    name: "Piles (Haemorrhoids)",
    localName: "बवासीर / मूळव्याध",
    category: "anorectal",
    badge: "Ayurvedic Injection Therapy",
    shortDesc:
      "Treatment of internal and external piles with an Ayurvedic* injection on an OPD basis. No cuts and no admission.",
    about:
      "Piles, also called haemorrhoids, are caused by bulging of the veins in the lower part of the anus and rectum. When the veins bulge, their walls get stretched, irritated and bleed. Piles are classified as internal and external: internal piles occur inside the anal canal and can sometimes grow and come out of the anus, while external piles grow at the very end of the anus.",
    symptoms: [
      "Bleeding while passing stool",
      "Lump near the anus",
      "Pain and burning",
      "Itching",
      "Difficulty passing stool",
    ],
    highlights: [...INJECTION_POINTS],

    image: {
      src: `${DIAGRAMS}/diagram-piles-types.png`,
      alt: "Diagram of internal and external piles",
      caption: "Internal piles form inside the canal, external piles at the anal opening.",
    },
    overview: [
      "Everyone has soft cushions of tissue and small blood vessels in the anal canal. They help to close the anus and control stool. When the cushions swell, slip down or get irritated by pressure, they become piles.",
      "Piles are common, and many people live with them for a long time because of embarrassment. Bleeding is the most common sign, but it is also one of the reasons why an examination is needed, because bleeding can come from other conditions too.",
      "A doctor can tell you whether the piles are internal or external, and how far internal piles have come down. This guides the treatment plan.",
    ],
    types: [
      { title: "Internal piles", text: "Inside the anal canal. Often painless, with bright red bleeding. They can grow and come out of the anus." },
      { title: "External piles", text: "At the very end of the anus, under the skin. They can feel like a lump and cause itching, pain or burning." },
      { title: "Grades I to IV", text: "Internal piles are graded by how far they come down: staying inside (I), coming out and going back by themselves (II), needing to be pushed back (III), or staying outside (IV)." },
    ],
    causes: [
      "Constipation and straining while passing stool",
      "Sitting for a long time on the toilet",
      "A low-fibre diet and low water intake",
      "Long hours of sitting or driving",
      "Pregnancy and being overweight",
      "Lifting heavy weights with straining",
      "Ageing and a family tendency",
    ],
    selfCare: [
      "Eat fibre-rich food and drink enough water",
      "Do not strain or sit long on the toilet",
      "Clean gently with water and pat dry",
      "Sit in warm water for 10 to 15 minutes if sore",
      "Walk daily and avoid long sitting",
    ],
    whenToSeeDoctor: [
      "Any bleeding while passing stool",
      "A lump that keeps coming out or does not go back",
      "Pain, itching or burning that does not settle in a few days",
      "Dark or black stool, or blood mixed with stool",
      "Heavy bleeding, dizziness or fainting: go to a hospital urgently",
    ],
    whatToExpect: [
      "Consultation and examination with Dr. Mahesh Shete",
      "Your condition and its stage are explained",
      "Ayurvedic* injection therapy is planned for you",
      "Treatment on an OPD basis: no cuts and no admission",
      "Back to routine: no bed rest, no leave from work and no hard dietary restrictions",
    ],
    faqs: [
      {
        q: "Is the treatment painful or does it leave a scar?",
        a: "The therapy is done without cuts and is scarless. The injection also relieves per-rectal pain and burning.",
      },
      {
        q: "Will I have to stay in hospital?",
        a: "No. It is only OPD basis treatment, with no admission.",
      },
    ],
    relatedGuides: ["what-are-piles", "piles-causes-risk-factors", "piles-diet-lifestyle-prevention"],
  },

  {
    id: "fissure",
    name: "Fissure",
    localName: "फिशर",
    category: "anorectal",
    badge: "Without Operation",
    shortDesc:
      "Ayurvedic* injection-based treatment for anal fissure, without surgery and without hospital admission.",
    about:
      "An anal fissure is a small tear in the lining of the anal canal. It commonly causes sharp pain and burning while or after passing stool, and sometimes bleeding.",
    symptoms: [
      "Pain and burning while passing stool",
      "Bleeding",
      "Itching",
      "Difficulty passing stool",
    ],
    highlights: [
      "Only OPD basis treatment, no admission",
      "No cuts, no operation",
      "No bed rest or leave from routine work needed",
      "Scarless treatment",
    ],

    image: {
      src: `${DIAGRAMS}/diagram-fissure.png`,
      alt: "Diagram of an anal fissure",
      caption: "A fissure is a tear in the lining of the lower anal canal.",
    },
    overview: [
      "The skin lining the lower anal canal is thin and sensitive, so even a small tear can cause strong pain. The pain is usually worst during and just after passing stool, and the burning can continue for minutes to hours.",
      "A painful tear makes the muscle around the anus tighten, and fear of pain makes the person hold back the stool. The stool becomes harder, and the tear is hurt again. Breaking this cycle early helps recovery.",
    ],
    types: [
      { title: "Acute fissure", text: "A recent tear. Often settles with soft stools and proper care." },
      { title: "Chronic fissure", text: "A tear that lasts longer than about six weeks. It is less likely to heal with home care alone and needs a doctor's assessment." },
    ],
    causes: [
      "Passing a large or hard stool",
      "Long-standing constipation and straining",
      "Repeated diarrhoea",
      "Childbirth",
      "A tight anal muscle",
    ],
    selfCare: [
      "Keep the stool soft with fibre and water",
      "Sit in warm water for 10 to 15 minutes after stool",
      "Do not hold back the urge",
      "Do not strain",
      "Clean gently and pat dry",
    ],
    whenToSeeDoctor: [
      "Sharp pain with every stool for more than a few days",
      "Pain that lasts for hours after passing stool",
      "Repeated streaks of blood",
      "Fear of going to the toilet because of pain",
      "A small lump or skin tag near the tear",
    ],
    whatToExpect: [
      "Consultation and examination with Dr. Mahesh Shete",
      "The fissure is confirmed and explained",
      "Ayurvedic* injection-based treatment is planned",
      "OPD basis treatment: no cuts, no operation and no admission",
      "No bed rest and no leave from routine work are needed",
    ],
    faqs: [
      {
        q: "Is a fissure treated without an operation here?",
        a: "Yes. At the clinic fissure is treated without surgery, with Ayurvedic* injection-based treatment.",
      },
      {
        q: "Can I continue my work?",
        a: "Yes. No bed rest and no leave from routine work are needed.",
      },
    ],
    relatedGuides: ["understanding-anal-fissure", "symptoms-piles-fissure-fistula", "piles-diet-lifestyle-prevention"],
  },

  {
    id: "fistula",
    name: "Fistula",
    localName: "भगन्दर / भगंदर",
    category: "anorectal",
    badge: "Without Surgery, Laser or Ksharsutra",
    shortDesc:
      "Fistula treated with Ayurvedic* injection / applicators. About 20 minutes procedure, no hospital stay.",
    about:
      "There are different treatment options for anal fistula, depending on its severity. At Happy Morning Piles Clinic, fistula is treated without surgery, without laser and without ksharsutra, using Ayurvedic* injection / applicators. There is no need to stay in hospital; the procedure takes about 20 minutes.",
    symptoms: [
      "Pain and swelling near the anus",
      "Discharge or pus from an opening near the anus",
      "Itching and irritation",
      "Discomfort while sitting or passing stool",
    ],
    highlights: [
      "No surgery, no laser, no ksharsutra",
      "About 20 minutes procedure",
      "Only OPD basis treatment, no admission",
      "No stay in hospital",
    ],

    image: {
      src: `${DIAGRAMS}/diagram-fistula.png`,
      alt: "Diagram of an anal fistula tunnel",
      caption: "A fistula is a tunnel between the anal canal and the skin.",
    },
    overview: [
      "A fistula is a small abnormal tunnel that connects the inside of the anal canal to the skin near the anus. It usually begins as an infection of a small gland in the canal, which forms an abscess. When the abscess bursts or is drained, a tunnel can remain.",
      "Because the tunnel is connected to the bowel, it can get infected again and again, so discharge may stop for a while and then return. A fistula that keeps coming back should be examined.",
      "The doctor looks at the direction and depth of the tunnel, how close it is to the muscle that controls the anus, and whether there is more than one tunnel. These details help to decide the treatment.",
    ],
    types: [
      { title: "Abscess stage", text: "A painful, hot swelling near the anus, sometimes with fever. This needs to be seen the same day." },
      { title: "Fistula stage", text: "A tunnel with repeated discharge of pus or blood-stained fluid from an opening on the skin." },
    ],
    causes: [
      "A past or recent anal abscess",
      "Infection of the small glands in the anal canal",
      "Certain bowel conditions such as Crohn's disease",
      "Lowered immunity",
    ],
    selfCare: [
      "Keep the area clean and dry",
      "Wear a clean pad if there is discharge",
      "Sit in warm water for comfort",
      "Keep the stool soft and avoid straining",
      "Do not squeeze or press on any swelling",
    ],
    whenToSeeDoctor: [
      "Repeated discharge or pus near the anus",
      "A swelling that comes and goes",
      "Pain while sitting or passing stool",
      "A sudden hot, painful swelling or fever: see a doctor the same day",
    ],
    whatToExpect: [
      "Consultation and examination with Dr. Mahesh Shete",
      "The severity and course of the fistula are assessed",
      "Treatment with Ayurvedic* injection / applicators is planned",
      "A procedure of about 20 minutes on an OPD basis, with no hospital stay",
      "No surgery, no laser and no ksharsutra",
    ],
    faqs: [
      {
        q: "How long does the procedure take?",
        a: "About 20 minutes.",
      },
      {
        q: "Is surgery, laser or ksharsutra used?",
        a: "No. Fistula at this clinic is treated without surgery, laser or ksharsutra.",
      },
    ],
    relatedGuides: ["understanding-anal-fistula", "rectal-bleeding-when-to-see-a-doctor", "what-to-expect-first-visit"],
  },

  {
    id: "pilonidal-sinus",
    name: "Pilonidal Sinus",
    localName: "पायलोनाइडल साइनस",
    category: "anorectal",
    badge: "Anorectal Care",
    shortDesc:
      "Consultation and treatment for pilonidal sinus, one of the clinic's main treatments.",
    about:
      "A pilonidal sinus is a small channel or pocket in the skin near the top of the cleft between the buttocks. It can become painful, swollen or start to discharge. Consult Dr. Mahesh Shete for examination and a treatment plan.",
    symptoms: [
      "Pain or swelling near the tailbone",
      "Discharge from a small opening in the skin",
      "Tenderness while sitting",
    ],
    highlights: [
      "Examination by a piles & fistula specialist",
      "OPD basis consultation",
    ],

    image: {
      src: `${DIAGRAMS}/diagram-pilonidal.png`,
      alt: "Cut-away diagram of a pilonidal sinus",
      caption: "A pilonidal sinus is a pit and pocket under the skin near the tailbone.",
    },
    overview: [
      "A pilonidal sinus is not a problem of the anal canal itself. It forms in the skin near the tailbone, but it is often confused with a fistula because of the swelling and discharge near the lower back and buttocks.",
      "A common explanation is that loose hair is pushed into the skin of the cleft. The skin reacts, the pit gets infected and a pocket forms. If the pocket fills with pus it can become an abscess.",
    ],
    causes: [
      "Long hours of sitting, such as desk jobs or driving",
      "A deep cleft with sweating and friction",
      "Loose or coarse body hair",
      "Being overweight",
    ],
    selfCare: [
      "Keep the area clean and dry",
      "Take short walking breaks if you sit for long",
      "Wear loose, breathable clothes",
      "Do not squeeze, scratch or pick at the opening",
    ],
    whenToSeeDoctor: [
      "Pain, swelling or redness near the tailbone",
      "Discharge from a small opening in the skin",
      "A hot, tender swelling or fever: see a doctor the same day",
    ],
    whatToExpect: [
      "Consultation and examination with Dr. Mahesh Shete",
      "The condition is explained and a treatment plan is discussed",
      "OPD basis consultation",
    ],
    faqs: [
      {
        q: "Is a pilonidal sinus the same as a fistula?",
        a: "No. A fistula connects the anal canal to the skin. A pilonidal sinus is a pit and pocket in the skin near the tailbone.",
      },
    ],
    relatedGuides: ["pilonidal-sinus-explained", "what-to-expect-first-visit"],
  },

  {
    id: "stomach-ailments",
    name: "Stomach-Related Ailments",
    localName: "पेट से संबंधित बीमारियाँ",
    category: "abdominal",
    badge: "Ayurvedic Medicines",
    shortDesc:
      "Ayurvedic medicines for all stomach-related diseases, alongside anorectal care.",
    about:
      "Apart from piles, fissure and fistula, the clinic also treats stomach-related diseases with Ayurvedic medicines, combining modern techniques with Ayurveda.",
    symptoms: [
      "Constipation or difficulty passing stool",
      "Discomfort or pain in the abdomen",
    ],
    highlights: [
      "Treatment with Ayurvedic medicines",
      "Consultation by registered Ayurvedic practitioners",
    ],

    image: {
      src: `${DIAGRAMS}/diagram-digestive.png`,
      alt: "Diagram of the digestive tract",
      caption: "Digestion and bowel habits affect piles, fissure and fistula.",
    },
    overview: [
      "The digestive tract runs from the stomach to the anus. How well it works affects how soft or hard the stool is, and that in turn affects piles and fissure.",
      "For example, long-standing constipation makes you strain, which raises pressure on the veins around the anus. Looking at digestion together with the anal problem gives a more complete picture.",
    ],
    causes: [
      "Irregular meal timings and low-fibre food",
      "Too little water",
      "Sitting for long hours with little activity",
      "Stress and irregular sleep",
    ],
    selfCare: [
      "Eat at regular times and chew slowly",
      "Include fibre-rich food and enough water",
      "Take a short walk after meals",
      "Do not hold back the urge to pass stool",
    ],
    whenToSeeDoctor: [
      "Constipation that lasts for more than a couple of weeks",
      "Repeated or severe pain in the abdomen",
      "Black stool, blood in stool or vomiting blood: seek urgent care",
      "Unexplained weight loss",
    ],
    whatToExpect: [
      "Consultation by registered Ayurvedic practitioners",
      "Your complaints and bowel habits are discussed",
      "Treatment with Ayurvedic medicines is advised",
    ],
    faqs: [
      {
        q: "Can I consult for stomach problems along with piles?",
        a: "Yes. The clinic treats stomach-related diseases with Ayurvedic medicines alongside anorectal care.",
      },
    ],
    relatedGuides: ["piles-diet-lifestyle-prevention", "what-to-expect-first-visit"],
  },
];
