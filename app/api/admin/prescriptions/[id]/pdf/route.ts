import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { getPrescriptionById } from '@/lib/prescriptions';
import { generatePrescriptionPdf, prescriptionFileName } from '@/lib/prescriptionPdf';
import { getLetterhead } from '@/lib/letterhead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/admin/prescriptions/:id/pdf  -> downloads the prescription as a PDF
export async function GET(
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
      return NextResponse.json({ error: 'Prescription not found. Save it first.' }, { status: 404 });
    }

    const bytes = await generatePrescriptionPdf(prescription, await getLetterhead());
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${prescriptionFileName(prescription)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[prescriptions] pdf failed:', err);
    return NextResponse.json({ error: 'Failed to generate PDF.' }, { status: 500 });
  }
}