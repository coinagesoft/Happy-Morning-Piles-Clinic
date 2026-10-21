import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { ToastProvider } from '@/components/ui/Toast';
import { CLINIC } from '@/lib/clinicInfo';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: `${CLINIC.name}, ${CLINIC.address.area}`,
    template: `%s | ${CLINIC.name}`,
  },
  description:
    'Ayurvedic* injection therapy for piles, fissure, fistula and pilonidal sinus with Dr. Mahesh Shete in Akurdi, PCMC, Pune. No cuts, no admission, only OPD basis treatment.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
