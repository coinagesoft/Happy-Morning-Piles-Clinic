# Happy Morning Piles Clinic

Next.js website and appointment system for **Happy Morning Piles Clinic** (Ayurvedic Injection Therapy Center), Akurdi, PCMC, Pune, with **Dr. Mahesh Shete**, Piles & Fistula Specialist.

- Phone: +91 70667 47811
- Address: 4th Floor, Ecorb Millinia Tower, Vivek Nagar, Pavle bridge, Akurdi, PCMC, Pune - 411035

## Editing clinic details
All public clinic details live in `lib/clinicInfo.ts`. Treatments are in `lib/treatmentsData.ts` and health guides in `lib/newsData.ts`.

## Run
```bash
npm install
npm run dev
```

## Environment (`.env.local`)
```env
DOCTOR_EMAIL=your-doctor-email@gmail.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```
Connect Google Calendar from the booking page ("Connect Google Calendar") to create Google Meet links. Set a strong admin JWT secret via environment variable before deploying.
