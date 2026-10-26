import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getPrescriptionById, markPrescriptionEmailed } from '@/lib/prescriptions';
import { formatRxDate, escapeHtml } from '@/lib/prescriptionTemplate';
import { generatePrescriptionPdf, prescriptionFileName } from '@/lib/prescriptionPdf';
import { getLetterhead } from '@/lib/letterhead';
import { sendHtmlEmail, isMailerConfigured } from '@/lib/mailer';
import { DOCTOR_EMAIL } from '@/lib/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/admin/prescriptions/:id/send   body: { email?: string }
// Emails the prescription to the patient as a PDF attachment.
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

    if (!isMailerConfigured()) {
      return NextResponse.json(
        {
          error:
            'Email is not set up yet. Add SMTP_USER and SMTP_PASS (Gmail App Password) to your environment and restart the server.',
        },
        { status: 503 }
      );
    }

    let body: { email?: string } = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }
    const to = (body.email || prescription.patientEmail || '').trim();
    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 });
    }

    const lh = await getLetterhead();
    const pdfBytes = await generatePrescriptionPdf(prescription, lh);
    const fileName = prescriptionFileName(prescription);
    const dateLabel = formatRxDate(prescription.date);

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:14px;line-height:1.6;max-width:560px;">
  <p>Dear ${escapeHtml(prescription.patientName)},</p>
  <p>Thank you for consulting <strong>${escapeHtml(lh.doctorName)}</strong>. Your prescription dated <strong>${escapeHtml(dateLabel)}</strong> is attached to this email as a PDF. You can save it or print it whenever you need.</p>
  <p>Please take the medicines exactly as written in the prescription. If you have any questions, just reply to this email or call us on ${escapeHtml(lh.phone)}.</p>
  <p style="margin-top:22px;">Warm regards,<br/><strong>${escapeHtml(lh.doctorName)}</strong><br/>${escapeHtml(lh.clinicName)}<br/><span style="color:#6b7280;font-size:12px;">${escapeHtml(lh.address)}</span></p>
</div>`;

    const text = `Dear ${prescription.patientName},\n\nYour prescription dated ${dateLabel} from ${lh.doctorName} is attached as a PDF.\n\nPlease take the medicines exactly as written. For any questions, reply to this email or call ${lh.phone}.\n\n${lh.doctorName}\n${lh.clinicName}`;

    await sendHtmlEmail({
      to,
      subject: `Your prescription from ${lh.doctorName} (${dateLabel})`,
      html,
      text,
      replyTo: DOCTOR_EMAIL,
      attachments: [
        { filename: fileName, content: Buffer.from(pdfBytes), contentType: 'application/pdf' },
      ],
    });
    await markPrescriptionEmailed(id);

    return NextResponse.json({ success: true, sentTo: to });
  } catch (err) {
    console.error('[prescriptions] send failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to send email.';
    return NextResponse.json({ error: `Could not send email: ${message}` }, { status: 500 });
  }
}