import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getPrescriptionById } from '@/lib/prescriptions';
import { CLINIC_INFO, formatRxDate } from '@/lib/prescriptionTemplate';
import { generatePrescriptionPdf, prescriptionFileName } from '@/lib/prescriptionPdf';
import { sendWhatsAppPdf, WhatsAppNotConnectedError } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/admin/prescriptions/:id/whatsapp   body: { phone?: string }
// Sends the prescription PDF to the patient on WhatsApp automatically.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Unauthorized access.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const prescription = await getPrescriptionById(id);
    if (!prescription) {
      return NextResponse.json(
        { error: 'Save the prescription before sending it.' },
        { status: 404 }
      );
    }

    let body: { phone?: string } = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }
    const phone = (body.phone || prescription.patientPhone || '').trim();

    const pdfBytes = await generatePrescriptionPdf(prescription);
    const dateLabel = formatRxDate(prescription.date);

    const caption =
      `Hello ${prescription.patientName},\n\n` +
      `Your prescription dated ${dateLabel} from ${CLINIC_INFO.doctorName} ` +
      `(${CLINIC_INFO.clinicName}) is attached.\n\n` +
      `Please take the medicines exactly as written. For any questions, call ${CLINIC_INFO.phone}.`;

    const { to } = await sendWhatsAppPdf({
      phone,
      pdf: Buffer.from(pdfBytes),
      fileName: prescriptionFileName(prescription),
      caption,
    });

    return NextResponse.json({ success: true, sentTo: to });
  } catch (err) {
    if (err instanceof WhatsAppNotConnectedError) {
      return NextResponse.json({ error: err.message, code: 'not_connected' }, { status: 409 });
    }
    console.error('[prescriptions] whatsapp send failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to send WhatsApp message.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}