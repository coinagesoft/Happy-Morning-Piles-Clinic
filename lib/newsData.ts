import { CLINIC, FIVE_MAIN_SYMPTOMS, INJECTION_POINTS } from "./clinicInfo";

export interface ArticleImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface ArticleSection {
  heading: string;
  paragraphs: string[];
  /** Optional bullet list shown after the paragraphs */
  bullets?: string[];
  /** Optional numbered steps shown after the paragraphs / bullets */
  steps?: string[];
  callout?: string;
  /** Optional illustration shown after the heading */
  image?: ArticleImage;
}

export interface ArticleFaq {
  q: string;
  a: string;
}

export interface NewsArticle {
  slug: string;
  title: string;
  category: string;
  readTime: string;
  image: string;
  summary: string;
  keyTakeaways: string[];
  contentSections: ArticleSection[];
  faqs?: ArticleFaq[];
  relatedSlugs: string[];
}

const DIAGRAMS = "/assets/diagrams";

export const NEWS_ARTICLES: NewsArticle[] = [
  /* ------------------------------------------------------------------ */
  {
    slug: "what-are-piles",
    title: "What Are Piles (Haemorrhoids)? Causes, Types and Symptoms",
    category: "Piles",
    readTime: "6 min read",
    image: CLINIC.poster,
    summary:
      "Piles, also called haemorrhoids, are caused by bulging veins in the lower part of the anus and rectum. Learn the two types, the four grades and the main symptoms to look out for.",
    keyTakeaways: [
      "Piles are bulging veins in the lower anus and rectum",
      "They are classified as internal or external",
      "Internal piles are also described in four grades, from I to IV",
      "Bleeding, lumps, pain and itching are the common signs",
      "Bleeding is not always piles, so get examined",
    ],
    contentSections: [
      {
        heading: "What happens in piles?",
        paragraphs: [
          "Piles, also called haemorrhoids, are caused as a result of bulging of veins in the lower part of the anus and rectum. When the veins bulge, the walls of the veins get stretched, irritated and bleed.",
          "Everyone has soft cushions of tissue and small blood vessels in the anal canal. They help to close the anus and control stool. When these cushions swell, slip down or get irritated, they become piles.",
          "Piles are very common. Many people feel shy to talk about them and delay seeing a doctor, so a small problem is often allowed to become a bigger one.",
        ],
      },
      {
        heading: "Internal and external piles",
        image: {
          src: `${DIAGRAMS}/diagram-piles-types.png`,
          alt: "Diagram showing internal piles inside the anal canal and external piles at the anal opening, separated by the dentate line",
          caption: "Internal piles form above the dentate line, external piles below it.",
        },
        paragraphs: [
          "Piles are classified into internal and external types. Internal piles occur inside the anal canal. They can grow and come out of the anus at times. External piles grow at the very end of the anus.",
        ],
        bullets: [
          "Internal piles: inside the canal, usually not felt. The first sign is often bright red blood while passing stool. When larger, they can come out of the anus.",
          "External piles: at the anal opening, under the skin. They can be felt as a lump, and can cause itching, discomfort, pain or burning.",
        ],
      },
      {
        heading: "The four grades of internal piles",
        image: {
          src: `${DIAGRAMS}/diagram-piles-grades.png`,
          alt: "Four panels showing grade I to grade IV internal piles coming progressively further down and out of the anus",
          caption: "The grade describes how far internal piles have come down.",
        },
        paragraphs: [
          "Doctors often describe internal piles in four grades. The grade helps to decide the treatment plan, and it can only be confirmed by examination.",
        ],
        bullets: [
          "Grade I: the swelling stays inside the canal. There may be bleeding, but nothing is felt outside.",
          "Grade II: the piles come out while passing stool or straining, and go back inside on their own.",
          "Grade III: the piles come out and go back only when pushed in with a finger.",
          "Grade IV: the piles stay outside and cannot be pushed back. This needs prompt medical care.",
        ],
      },
      {
        heading: "Main symptoms",
        paragraphs: [
          `The five main symptoms are: ${FIVE_MAIN_SYMPTOMS.map((s) => s.en.toLowerCase()).join(", ")}.`,
          "Bleeding from piles is usually bright red and is seen on the toilet paper, in the toilet bowl or on the stool. It is often painless. Pain, if present, is more common with external piles, or when a pile becomes very swollen.",
        ],
        callout:
          "Rectal bleeding can have more than one cause. Please get examined by a doctor instead of assuming it is piles.",
      },
      {
        heading: "Is it really piles? Why examination matters",
        paragraphs: [
          "Piles, fissure and fistula can look and feel similar to the patient, and treatment for one is not right for another. Bleeding can also come from other conditions of the lower bowel.",
          "A proper examination by a doctor tells you what the problem is, how advanced it is and which treatment suits you. It also avoids the risk of ignoring a different condition that needs attention.",
        ],
      },
      {
        heading: "Simple steps that ease discomfort",
        paragraphs: [
          "These steps can reduce irritation while you plan your visit. They do not replace an examination.",
        ],
        bullets: [
          "Do not strain or sit for a long time on the toilet.",
          "Eat fibre-rich food and drink enough water so the stool stays soft.",
          "Clean gently with water after passing stool and pat dry. Avoid rough rubbing.",
          "Sit in a tub of warm water for 10 to 15 minutes if the area feels sore.",
          "Take a short walk daily instead of sitting for many hours at a stretch.",
        ],
      },
      {
        heading: "How the clinic can help",
        paragraphs: [
          `${CLINIC.name} offers Ayurvedic* injection therapy for piles on an OPD basis. There are no cuts and no admission. ${CLINIC.doctor.name} will examine you first and then explain the treatment.`,
        ],
      },
    ],
    faqs: [
      {
        q: "Are piles dangerous?",
        a: "Piles themselves are usually not dangerous, but they can be painful and troublesome. Because other conditions can also cause bleeding, any rectal bleeding should be checked by a doctor.",
      },
      {
        q: "Do piles go away on their own?",
        a: "Small piles may settle when the stool is kept soft and straining is avoided, but they often return if the cause continues. If symptoms keep coming back or are getting worse, get examined.",
      },
      {
        q: "Is bleeding from piles painful?",
        a: "Bleeding from piles is often painless. Sharp pain while passing stool is more typical of a fissure, so pain with bleeding is another reason to be examined.",
      },
    ],
    relatedSlugs: ["piles-causes-risk-factors", "symptoms-piles-fissure-fistula", "injection-therapy-opd-treatment"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "understanding-anal-fistula",
    title: "Understanding Anal Fistula and Your Treatment Options",
    category: "Fistula",
    readTime: "6 min read",
    image: CLINIC.banner,
    summary:
      "There are different treatment options for anal fistula depending on its severity. Learn how a fistula forms, its warning signs and how the clinic treats it without surgery, laser or ksharsutra.",
    keyTakeaways: [
      "A fistula is a small tunnel between the anal canal and the skin",
      "It usually follows an infection or abscess near the anus",
      "Treatment options depend on the severity of the fistula",
      "No surgery, no laser and no ksharsutra at this clinic",
      "About 20 minutes procedure with no hospital stay",
    ],
    contentSections: [
      {
        heading: "What is an anal fistula?",
        image: {
          src: `${DIAGRAMS}/diagram-fistula.png`,
          alt: "Diagram of an anal fistula showing the internal opening, the tunnel and the external opening on the skin",
          caption: "A fistula joins the inside of the anal canal to the skin near the anus.",
        },
        paragraphs: [
          "An anal fistula is a small abnormal tunnel that connects the inside of the anal canal to the skin around the anus. It has an opening inside the canal and another opening on the skin.",
          "Most fistulas start with an infection in one of the small glands inside the anal canal. The infection can form an abscess, which is a painful collection of pus. When the abscess bursts or is drained, a tunnel may remain behind.",
        ],
      },
      {
        heading: "Common symptoms",
        paragraphs: [
          "The signs can come and go, which makes many people ignore the problem for months or even years.",
        ],
        bullets: [
          "Repeated pus or blood-stained discharge from a small opening near the anus",
          "Pain and swelling near the anus, which may ease when the discharge comes out",
          "Itching, redness and irritation of the skin around the opening",
          "Discomfort while sitting or passing stool",
          "Sometimes fever and feeling unwell when pus collects again",
        ],
        callout:
          "Sudden severe pain, a hot tender swelling near the anus or fever can mean an abscess. Please see a doctor the same day.",
      },
      {
        heading: "Why a fistula does not usually heal by itself",
        paragraphs: [
          "The tunnel is connected to the inside of the bowel, so it can get infected again and again. The opening may close for a while and then burst open again, so the problem seems to disappear but returns.",
          "Because of this, a fistula that keeps coming back should be examined rather than only managed with ointments or antibiotics.",
        ],
      },
      {
        heading: "Treatment depends on severity",
        paragraphs: [
          "There are different treatment options for anal fistula, depending on the severity of the condition. A proper examination is the first step.",
          "The doctor looks at where the tunnel runs, how deep it is, how close it is to the muscle that controls the anus, and whether there is more than one tunnel. These details decide which treatment is suitable.",
        ],
      },
      {
        heading: "Treatment at Happy Morning Piles Clinic",
        paragraphs: [
          "Fistula is treated without surgery, without laser and without ksharsutra, using Ayurvedic* injection / applicators.",
          "There is no need to stay in hospital. The procedure takes about 20 minutes and is done on an OPD basis.",
        ],
        bullets: [
          "No surgery, no laser, no ksharsutra",
          "About 20 minutes procedure",
          "Only OPD basis treatment, no admission",
          "No stay in hospital",
        ],
      },
      {
        heading: "Who is more likely to get a fistula?",
        paragraphs: [
          "A fistula can affect anyone, but it is more likely after an earlier anal abscess, in people with certain bowel conditions such as Crohn's disease, and in people with lowered immunity. Telling the doctor about your full history helps to plan the right treatment.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is a fistula the same as piles?",
        a: "No. Piles are swollen veins and cushions in the anal canal. A fistula is a tunnel between the canal and the skin. Both can cause discomfort near the anus, so an examination is needed to know which one you have.",
      },
      {
        q: "Will I need to stay in hospital?",
        a: `No. At ${CLINIC.name} the treatment is only on an OPD basis, with no admission and no stay in hospital.`,
      },
      {
        q: "How long does the procedure take?",
        a: "The procedure takes about 20 minutes.",
      },
    ],
    relatedSlugs: ["rectal-bleeding-when-to-see-a-doctor", "injection-therapy-opd-treatment", "symptoms-piles-fissure-fistula"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "symptoms-piles-fissure-fistula",
    title: "5 Main Symptoms of Piles, Fissure and Fistula",
    category: "Symptoms",
    readTime: "5 min read",
    image: CLINIC.poster,
    summary:
      "Bleeding, a lump near the anus, pain and burning, itching and difficulty passing stool are the five main symptoms to watch for. Learn what each one can mean.",
    keyTakeaways: [
      "Five main symptoms are common to anorectal problems",
      "The same symptom can come from piles, fissure or fistula",
      "Do not ignore bleeding during stool",
      "Consult early for examination and a treatment plan",
    ],
    contentSections: [
      {
        heading: "The five main symptoms",
        paragraphs: FIVE_MAIN_SYMPTOMS.map((s) => `${s.en} (${s.hi})`),
        callout:
          "Symptoms overlap between piles, fissure and fistula, so an examination is needed to know which condition you have.",
      },
      {
        heading: "1. Bleeding while passing stool",
        paragraphs: [
          "Bright red blood on the toilet paper, in the bowl or on the stool is the most common reason people look for help. In piles it is often painless. In a fissure it is usually a thin streak with pain. Bleeding should never be ignored, because it can also come from conditions other than piles.",
        ],
      },
      {
        heading: "2. Lump near the anus",
        paragraphs: [
          "A soft lump may be a pile that has come out or an external pile. A painful, hot, swollen lump can be an abscess, which may later lead to a fistula. A small skin tag can remain after a fissure heals. Only an examination can tell these apart.",
        ],
      },
      {
        heading: "3. Pain and burning",
        paragraphs: [
          "Sharp, cutting pain during stool, followed by burning that can last for minutes or hours, is typical of a fissure. Piles are often painless unless they are very swollen. Throbbing pain with swelling near the anus can point to an abscess.",
        ],
      },
      {
        heading: "4. Itching",
        paragraphs: [
          "Itching around the anus can come from piles, from a fistula discharge irritating the skin, or from skin problems. Scratching makes the skin sore and can start a cycle of itching and irritation, so do not just treat it with creams without knowing the cause.",
        ],
      },
      {
        heading: "5. Difficulty passing stool",
        paragraphs: [
          "Fear of pain can make a person hold back the stool, which makes it harder and drier and causes even more pain. Swollen piles can also create a feeling that the stool cannot pass completely. Long-standing constipation should be looked at along with the anal problem.",
        ],
      },
      {
        heading: "Which condition causes which symptom?",
        paragraphs: ["This is a general guide only. Several conditions can occur together."],
        bullets: [
          "Piles: bright red bleeding, often painless; a soft lump; itching; a feeling of fullness",
          "Fissure: sharp pain during and after stool; a thin streak of blood; fear of passing stool",
          "Fistula: repeated discharge or pus; swelling near the anus; irritation of the skin around the opening",
        ],
      },
      {
        heading: "When to visit the clinic",
        paragraphs: [
          `If you notice any of these symptoms, call ${CLINIC.phone.display} or book an appointment online with ${CLINIC.doctor.name}. Do not wait for the problem to become severe.`,
        ],
        callout:
          "Go to a hospital urgently if there is heavy bleeding, dizziness or fainting, or severe pain with fever.",
      },
    ],
    faqs: [
      {
        q: "Can I treat these symptoms with a cream?",
        a: "A cream may calm the symptoms for a short time but does not tell you the cause. If the symptom lasts more than a week or keeps coming back, get examined.",
      },
      {
        q: "Should I be worried if the bleeding stops by itself?",
        a: "Bleeding that stops can still return. A first bleed is a good reason for an examination to find out the cause.",
      },
    ],
    relatedSlugs: ["what-are-piles", "understanding-anal-fissure", "rectal-bleeding-when-to-see-a-doctor"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "injection-therapy-opd-treatment",
    title: "Ayurvedic Injection Therapy: What to Expect on an OPD Basis",
    category: "Treatment",
    readTime: "5 min read",
    image: CLINIC.banner,
    summary:
      "No cuts, no admission, no bed rest. A look at how Ayurvedic* injection therapy for piles is carried out at the clinic, how to prepare and what to expect.",
    keyTakeaways: [
      "Only OPD basis treatment, no admission needed",
      "No hard dietary restrictions and no bed rest",
      "Scarless treatment",
      "Consultation and treatment only by registered Ayurvedic practitioners",
    ],
    contentSections: [
      {
        heading: "What the therapy involves",
        paragraphs: [
          "Happy Morning Piles Clinic offers Ayurvedic* injection therapy for piles. The treatment is done on an OPD basis, with no cuts and no admission.",
          "You walk in, are examined and treated, and you can go back to your routine. There is no stay in hospital and no need for bed rest.",
        ],
      },
      {
        heading: "Points to know",
        paragraphs: [...INJECTION_POINTS],
        callout: `${CLINIC.advisory}`,
      },
      {
        heading: "Your visit, step by step",
        image: {
          src: `${DIAGRAMS}/infographic-your-visit.png`,
          alt: "Four steps: book, examination, treatment plan and OPD treatment",
          caption: "From booking to OPD treatment.",
        },
        paragraphs: ["Here is what a typical visit looks like."],
        steps: [
          "Book an appointment online or call the clinic.",
          `${CLINIC.doctor.name} listens to your symptoms and examines you.`,
          "Your condition is explained, along with the treatment plan that suits you.",
          "Treatment is done on an OPD basis. You do not need to be admitted.",
          "You go back to your routine. No bed rest and no leave from routine work are needed.",
        ],
      },
      {
        heading: "How to prepare for your visit",
        paragraphs: ["A little preparation helps the doctor to understand your problem quickly."],
        bullets: [
          "Note when the symptoms began and how often they occur",
          "Note your usual bowel habit and any recent change",
          "Carry the list of medicines you take, and any earlier reports or prescriptions",
          "Wear comfortable, loose clothes",
          "Come with your questions written down so nothing is forgotten",
        ],
      },
      {
        heading: "After the treatment",
        paragraphs: [
          "Hard dietary restrictions are not needed. Even so, soft stools help the area to stay comfortable, so keep eating fibre-rich food, drink enough water and avoid straining. Follow the advice the doctor gives you, including any follow-up visit.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is the treatment scarless?",
        a: "Yes. The therapy is done without cuts and is scarless.",
      },
      {
        q: "Do I need to stop eating certain foods?",
        a: "No hard dietary restrictions are needed. A fibre-rich diet and enough water are still good habits for your bowel health.",
      },
      {
        q: "Who gives the treatment?",
        a: "Consultation and treatment are done only by registered Ayurvedic practitioners.",
      },
    ],
    relatedSlugs: ["what-to-expect-first-visit", "what-are-piles", "understanding-anal-fistula"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "piles-causes-risk-factors",
    title: "Why Do Piles Happen? Causes, Risk Factors and Common Myths",
    category: "Causes",
    readTime: "5 min read",
    image: CLINIC.poster,
    summary:
      "Straining, constipation, long hours of sitting and low fibre are common reasons for piles. Understand the causes and separate facts from myths.",
    keyTakeaways: [
      "Extra pressure on the veins of the rectum and anus is the main trigger",
      "Constipation and straining are the most common causes",
      "Sitting for long hours, pregnancy and ageing add to the risk",
      "Many common beliefs about piles are myths",
    ],
    contentSections: [
      {
        heading: "The basic cause: pressure on the veins",
        paragraphs: [
          "The veins in the lower rectum and anus have to cope with pressure every day. When the pressure stays high for a long time, the veins stretch, bulge and become irritated. That is how piles develop.",
          "Anything that increases this pressure, or weakens the tissue that supports the veins, can cause or worsen piles.",
        ],
      },
      {
        heading: "Common causes and risk factors",
        paragraphs: ["Piles usually have more than one cause."],
        bullets: [
          "Constipation and straining while passing stool",
          "Long-standing diarrhoea",
          "A diet low in fibre and low in water",
          "Sitting for a long time on the toilet, including using the phone there",
          "Long hours of sitting at work or while driving",
          "Pregnancy, because of pressure in the pelvis and hormonal changes",
          "Being overweight",
          "Lifting heavy weights with straining",
          "Increasing age, as the supporting tissue becomes weaker",
          "A family tendency, as some people inherit weaker vein walls",
        ],
      },
      {
        heading: "Why constipation is the biggest culprit",
        paragraphs: [
          "Hard stool needs more pushing. Every hard push raises the pressure in the veins around the anus. Over months this pressure pulls the cushions downward and makes them swell.",
          "That is why softening the stool is the first step in almost every plan to prevent piles or to stop them from returning.",
        ],
      },
      {
        heading: "Myths and facts",
        paragraphs: ["Many patients carry beliefs that delay proper care."],
        bullets: [
          "Myth: Spicy food causes piles. Fact: Spicy food is not the main cause, but it can irritate the area in some people who already have piles.",
          "Myth: All bleeding from the anus is piles. Fact: Bleeding can have other causes, so it needs examination.",
          "Myth: Piles always need an operation. Fact: The treatment depends on the type and the stage. At this clinic piles are treated with Ayurvedic* injection therapy without cuts.",
          "Myth: Piles are contagious or caused by sitting on a cold floor. Fact: Neither is true.",
          "Myth: It is better to ignore piles because they are embarrassing. Fact: Early examination makes treatment simpler.",
        ],
      },
      {
        heading: "What you can change",
        paragraphs: [
          "You cannot change your age or family history, but you can change your diet, water intake, toilet habits and activity. These changes lower the pressure on the veins and reduce the chance of piles returning.",
        ],
        callout:
          "If you already have bleeding, a lump or pain, lifestyle changes alone may not be enough. Please get examined.",
      },
    ],
    faqs: [
      {
        q: "Can young people get piles?",
        a: "Yes. Piles are more common with age, but they are also seen in young adults, usually linked to constipation, straining or long hours of sitting.",
      },
      {
        q: "Can piles come back?",
        a: "They can, if the causes such as constipation and straining continue. Healthy bowel habits help to lower the chance.",
      },
    ],
    relatedSlugs: ["piles-diet-lifestyle-prevention", "what-are-piles", "rectal-bleeding-when-to-see-a-doctor"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "understanding-anal-fissure",
    title: "Anal Fissure: Causes, Symptoms and Care",
    category: "Fissure",
    readTime: "5 min read",
    image: CLINIC.banner,
    summary:
      "An anal fissure is a small tear in the lining of the anal canal that causes sharp pain during and after stool. Know the causes, the pain cycle and when to seek treatment.",
    keyTakeaways: [
      "A fissure is a small tear in the lining of the anal canal",
      "Sharp pain during and after stool is the typical sign",
      "Hard stool and constipation are the common causes",
      "Treated at the clinic without surgery and without admission",
    ],
    contentSections: [
      {
        heading: "What is an anal fissure?",
        image: {
          src: `${DIAGRAMS}/diagram-fissure.png`,
          alt: "Diagram of an anal fissure showing a small tear in the lower anal canal",
          caption: "A fissure is a tear in the lining of the lower anal canal.",
        },
        paragraphs: [
          "An anal fissure is a small tear in the lining of the anal canal. It commonly causes sharp pain and burning while or after passing stool, and sometimes bleeding.",
          "The skin lining the lower canal is thin and sensitive, so even a small tear can be very painful.",
        ],
      },
      {
        heading: "Common causes",
        paragraphs: ["A fissure usually starts when the lining is stretched more than it can bear."],
        bullets: [
          "Passing a large or hard stool",
          "Long-standing constipation and straining",
          "Repeated diarrhoea",
          "Childbirth",
          "A tight anal sphincter muscle",
        ],
      },
      {
        heading: "Symptoms to look for",
        paragraphs: [],
        bullets: [
          "Sharp, cutting pain while passing stool",
          "Burning or aching pain that can last for minutes to hours afterwards",
          "A thin streak of bright red blood on the toilet paper or stool",
          "Itching or irritation",
          "Fear of going to the toilet and difficulty passing stool",
        ],
      },
      {
        heading: "The pain cycle",
        paragraphs: [
          "Pain makes the muscle around the anus tighten. A tight muscle reduces blood supply to the area, so the tear heals slowly. The fear of pain also makes the person delay going to the toilet, and the stool becomes harder. A harder stool tears the area again.",
          "Breaking this cycle early is the key to healing.",
        ],
      },
      {
        heading: "Acute and chronic fissure",
        paragraphs: [
          "A recent tear is called an acute fissure. A fissure that lasts longer than about six weeks is called a chronic fissure. A chronic fissure can have a hard edge, a small skin tag and a visible sphincter muscle, and it is less likely to heal with home care alone.",
        ],
      },
      {
        heading: "Care that helps while you wait for your visit",
        paragraphs: [],
        bullets: [
          "Eat fibre-rich food and drink plenty of water to keep the stool soft",
          "Sit in warm water for 10 to 15 minutes after passing stool",
          "Do not hold back the urge to pass stool",
          "Do not strain or sit for long on the toilet",
          "Clean gently and pat dry",
        ],
      },
      {
        heading: "Treatment at the clinic",
        paragraphs: [
          "At Happy Morning Piles Clinic, fissure is treated with Ayurvedic* injection-based treatment, without surgery and without hospital admission.",
        ],
        bullets: [
          "Only OPD basis treatment, no admission",
          "No cuts, no operation",
          "No bed rest or leave from routine work needed",
          "Scarless treatment",
        ],
      },
    ],
    faqs: [
      {
        q: "How do I know it is a fissure and not piles?",
        a: "Sharp pain during and after stool with a thin streak of blood points more towards a fissure. Piles are often painless. Both can occur together, so an examination is the only way to be sure.",
      },
      {
        q: "Will a fissure heal on its own?",
        a: "A recent tear can heal with soft stools and care. If the pain lasts for weeks or keeps returning, get it examined.",
      },
    ],
    relatedSlugs: ["symptoms-piles-fissure-fistula", "piles-diet-lifestyle-prevention", "injection-therapy-opd-treatment"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "piles-diet-lifestyle-prevention",
    title: "Diet and Lifestyle Habits to Keep Your Bowels Healthy",
    category: "Lifestyle",
    readTime: "5 min read",
    image: CLINIC.poster,
    summary:
      "Soft stool and less straining protect you from piles and fissure. Here are simple diet, water, toilet and activity habits that fit everyday Indian meals.",
    keyTakeaways: [
      "Fibre, water and movement keep the stool soft and regular",
      "Avoid straining and long sitting on the toilet",
      "Small daily habits help to prevent piles and fissure from coming back",
      "Treatment at the clinic does not need hard dietary restrictions",
    ],
    contentSections: [
      {
        heading: "Why habits matter",
        image: {
          src: `${DIAGRAMS}/infographic-healthy-habits.png`,
          alt: "Six daily habits: eat fibre, drink water, stay active, do not strain, do not sit long and do not hold it in",
          caption: "Six daily habits for a healthy bowel.",
        },
        paragraphs: [
          "Most anal problems are linked to hard stool and straining. When the stool is soft and passes easily, the veins and the lining around the anus are under less pressure.",
          "Good habits are not a replacement for treatment when symptoms are present, but they greatly help to keep problems from returning.",
        ],
      },
      {
        heading: "Eat more fibre",
        paragraphs: [
          "Fibre adds bulk and softness to the stool. Many adults need about 25 to 30 grams of fibre a day. Add it slowly over a week or two so that gas and bloating do not trouble you.",
        ],
        bullets: [
          "Whole wheat chapati, jowar, bajra or ragi instead of only refined flour",
          "Dal, rajma, chana and other pulses",
          "Leafy vegetables such as palak and methi, and other vegetables with every meal",
          "Salad of cucumber, carrot and tomato",
          "Fruits such as papaya, guava, apple with the skin and ripe banana",
          "Oats, sprouts and nuts in small amounts",
        ],
      },
      {
        heading: "Drink enough water",
        paragraphs: [
          "Fibre works well only when you drink enough fluids. Aim for roughly 2 to 3 litres of fluids a day, mainly water, unless your doctor has told you to limit fluids. Buttermilk, coconut water and soups also count. Tea, coffee and alcohol can dry you out, so keep them in moderation.",
        ],
      },
      {
        heading: "Foods to limit",
        paragraphs: [],
        bullets: [
          "Maida products, white bread and bakery items",
          "Deep-fried and oily snacks",
          "Packaged and junk food, which are low in fibre",
          "Very spicy food during a flare-up if it irritates you",
          "Alcohol",
        ],
      },
      {
        heading: "Healthy toilet habits",
        paragraphs: [],
        bullets: [
          "Go when you feel the urge. Do not hold it in.",
          "Do not strain or push hard.",
          "Do not sit for more than a few minutes. Keep the phone out of the toilet.",
          "Clean gently with water and pat dry.",
          "Keep a regular time each day, for example after breakfast.",
        ],
      },
      {
        heading: "Stay active",
        paragraphs: [
          "A 30 minute walk most days keeps the bowels moving. If your job needs long hours of sitting, stand up and walk for a couple of minutes every hour. Avoid lifting heavy weights with straining.",
        ],
      },
      {
        heading: "A simple day plan",
        paragraphs: [],
        steps: [
          "Start the day with a glass or two of water.",
          "Have a fibre-rich breakfast, such as oats, fruit or a whole grain meal.",
          "Include dal or pulses and vegetables in lunch and dinner.",
          "Keep a bottle of water near you and sip through the day.",
          "Walk for about 30 minutes.",
        ],
        callout:
          "Talk to your doctor before starting any fibre supplement, especially if you have another health condition or take regular medicines.",
      },
    ],
    faqs: [
      {
        q: "Do I have to follow a strict diet during treatment?",
        a: "No hard dietary restrictions are needed for treatment at the clinic. A balanced, fibre-rich diet is still good for your bowel health.",
      },
      {
        q: "How soon will the diet change help?",
        a: "Many people notice softer, easier stools within one to two weeks, but habits need to be kept up for the benefit to last.",
      },
    ],
    relatedSlugs: ["piles-causes-risk-factors", "understanding-anal-fissure", "what-are-piles"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "pilonidal-sinus-explained",
    title: "Pilonidal Sinus: Symptoms, Causes and When to See a Doctor",
    category: "Pilonidal",
    readTime: "4 min read",
    image: CLINIC.banner,
    summary:
      "A pilonidal sinus is a small channel or pocket in the skin near the tailbone. It can become painful, swollen or start to discharge. Learn the signs and what to do.",
    keyTakeaways: [
      "A pilonidal sinus forms near the top of the cleft between the buttocks",
      "It can become painful, swollen or discharge pus",
      "Long sitting and loose hair are common contributors",
      "Examination is the first step towards a treatment plan",
    ],
    contentSections: [
      {
        heading: "What is a pilonidal sinus?",
        image: {
          src: `${DIAGRAMS}/diagram-pilonidal.png`,
          alt: "Cut-away diagram of a pilonidal sinus with a skin pit, hair and a pocket under the skin",
          caption: "A pilonidal sinus is a small pit and pocket under the skin near the tailbone.",
        },
        paragraphs: [
          "A pilonidal sinus is a small channel or pocket in the skin near the top of the cleft between the buttocks. It can become painful, swollen or start to discharge.",
          "It is not a problem of the anal canal itself, but it is looked after by piles and fistula specialists because the area is close by and the symptoms can seem similar.",
        ],
      },
      {
        heading: "Why does it happen?",
        paragraphs: [
          "The exact cause is not fully clear. A common explanation is that loose hair gets pushed into the skin of the cleft and the body reacts to it. The pit can then get infected and form a pocket.",
        ],
        bullets: [
          "Long hours of sitting, such as desk jobs or driving",
          "A deep cleft and sweating in the area",
          "Friction and tight clothing",
          "Being overweight",
          "Thick or coarse body hair",
        ],
      },
      {
        heading: "Symptoms",
        paragraphs: [],
        bullets: [
          "Pain or swelling near the tailbone",
          "Discharge from a small opening in the skin, sometimes with a bad smell",
          "Tenderness while sitting",
          "Redness and warmth of the skin when infected",
          "Fever when a pocket of pus (abscess) forms",
        ],
        callout:
          "Severe pain, a hot swelling or fever need to be seen the same day. Do not squeeze or press the swelling.",
      },
      {
        heading: "Keeping the area comfortable",
        paragraphs: [],
        bullets: [
          "Keep the area clean and dry",
          "Take short walking breaks if you sit for long hours",
          "Wear loose, breathable clothes",
          "Avoid scratching or picking at the opening",
        ],
      },
      {
        heading: "Getting help",
        paragraphs: [
          `Consult ${CLINIC.doctor.name} for examination and a treatment plan. The consultation is on an OPD basis.`,
        ],
      },
    ],
    faqs: [
      {
        q: "Is a pilonidal sinus the same as a fistula?",
        a: "No. A fistula is a tunnel from the anal canal to the skin. A pilonidal sinus is a pit and pocket in the skin near the tailbone, away from the anal canal.",
      },
    ],
    relatedSlugs: ["understanding-anal-fistula", "rectal-bleeding-when-to-see-a-doctor", "what-to-expect-first-visit"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "rectal-bleeding-when-to-see-a-doctor",
    title: "Blood in Stool: When to See a Doctor",
    category: "Guidance",
    readTime: "4 min read",
    image: CLINIC.banner,
    summary:
      "Blood in the stool is often from piles or fissure, but it can have other causes. Learn the warning signs that mean you should not wait.",
    keyTakeaways: [
      "Bright red blood is commonly from piles or a fissure",
      "Bleeding can also have other causes, so do not guess",
      "Dark, black or mixed blood, or heavy bleeding, needs prompt care",
      "Get any new bleeding checked by a doctor",
    ],
    contentSections: [
      {
        heading: "What the colour of blood can tell",
        paragraphs: [
          "Bright red blood on the toilet paper, on the surface of the stool or in the bowl usually comes from the lower part of the bowel or the anus. Piles and fissure are the common reasons.",
          "Dark red, maroon or black, sticky stool can mean bleeding from higher up in the digestive tract. This needs prompt medical advice.",
        ],
        callout:
          "Rectal bleeding can have more than one cause. Please get examined by a doctor instead of assuming it is piles.",
      },
      {
        heading: "Warning signs: do not wait",
        paragraphs: ["See a doctor soon if you have any of the following."],
        bullets: [
          "Bleeding that lasts more than a week or keeps coming back",
          "Blood mixed with the stool, or black, tar-like stool",
          "A change in your bowel habit that lasts for several weeks",
          "Unexplained weight loss, tiredness or looking pale",
          "Bleeding for the first time after the age of 40",
          "A family history of bowel or colon cancer",
          "Persistent pain, or a lump that keeps growing",
        ],
      },
      {
        heading: "Go to a hospital urgently if",
        paragraphs: [],
        bullets: [
          "The bleeding is heavy or does not stop",
          "You feel dizzy, weak or faint",
          "There is severe pain with fever",
          "A hot, very painful swelling develops near the anus",
        ],
      },
      {
        heading: "What the doctor will do",
        paragraphs: [
          "The doctor asks about your symptoms, bowel habits, diet and medicines, and then examines you. Depending on what is found, the doctor will explain the likely cause and the treatment, or advise further tests if needed.",
        ],
      },
      {
        heading: "Why not just wait?",
        paragraphs: [
          "Many people wait because of embarrassment or because the bleeding stops. But the cause remains. Early examination gives you a clear answer, and if the cause is a simple one such as piles or fissure, treatment is also simpler when started early.",
        ],
      },
    ],
    faqs: [
      {
        q: "I have only seen a few drops once. Do I still need to see a doctor?",
        a: "A single small episode with an obvious cause, such as a hard stool, may settle. If it repeats, or you are unsure, get examined.",
      },
      {
        q: "Can I take medicine from a medical store?",
        a: "It is better not to treat bleeding without knowing the cause. Medicine can hide the symptom while the real problem continues.",
      },
    ],
    relatedSlugs: ["what-are-piles", "symptoms-piles-fissure-fistula", "what-to-expect-first-visit"],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "what-to-expect-first-visit",
    title: "Your First Visit to Happy Morning Piles Clinic: What to Expect",
    category: "Visit",
    readTime: "3 min read",
    image: CLINIC.banner,
    summary:
      "A simple walk-through of booking, examination and OPD treatment at the clinic in Akurdi, PCMC, Pune, and what to carry with you.",
    keyTakeaways: [
      "Book online or call the clinic",
      "The doctor examines you first and explains the plan",
      "OPD basis treatment, no admission",
      "Carry your questions and any earlier reports",
    ],
    contentSections: [
      {
        heading: "Step by step",
        image: {
          src: `${DIAGRAMS}/infographic-your-visit.png`,
          alt: "Four steps: book, examination, treatment plan and OPD treatment",
          caption: "Your visit, step by step.",
        },
        paragraphs: [],
        steps: [
          `Book your appointment online or call ${CLINIC.phone.display}.`,
          `${CLINIC.doctor.name}, ${CLINIC.doctor.title}, listens to your symptoms and examines you.`,
          "The doctor explains what the condition is and which treatment suits you.",
          "Treatment is only on an OPD basis, with no admission and no stay in hospital.",
          "You return to your routine. No bed rest and no leave from routine work are needed.",
        ],
      },
      {
        heading: "What to carry",
        paragraphs: [],
        bullets: [
          "Earlier prescriptions, reports or scans, if any",
          "A list of medicines you currently take",
          "Notes on when the symptoms started and how they have changed",
          "A phone number of a family member, if you wish to be accompanied",
        ],
      },
      {
        heading: "Questions you may want to ask",
        paragraphs: [],
        bullets: [
          "What is my condition and how advanced is it?",
          "What are my treatment options?",
          "How long will the treatment take and how many visits will I need?",
          "What should I eat, and what should I avoid?",
          "When should I come back for a follow-up?",
        ],
      },
      {
        heading: "Finding the clinic",
        paragraphs: [
          `${CLINIC.name} is at ${CLINIC.address.full}. Landmark: ${CLINIC.address.landmark}. Call ${CLINIC.phone.display} for directions or to confirm timings.`,
        ],
        callout: `${CLINIC.advisory}`,
      },
    ],
    faqs: [
      {
        q: "Do I need to feel shy about the examination?",
        a: "Doctors examine such problems every day. Telling the doctor everything openly helps in getting the right diagnosis.",
      },
      {
        q: "Can I book online?",
        a: "Yes. Use the Book Appointment button on the website, or call the clinic.",
      },
    ],
    relatedSlugs: ["injection-therapy-opd-treatment", "rectal-bleeding-when-to-see-a-doctor", "what-are-piles"],
  },
];
