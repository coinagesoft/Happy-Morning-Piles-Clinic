import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { bulkImportMedicines } from '@/lib/medicines';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function unauthorized(error?: string) {
  return NextResponse.json({ error: error || 'Unauthorized access.' }, { status: 401 });
}

// POST /api/admin/medicines/import — Bulk import medicines from Excel / CSV parsed rows
export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No medicine rows provided to import.' },
        { status: 400 }
      );
    }

    if (items.length > 5000) {
      return NextResponse.json(
        { error: 'Cannot import more than 5,000 items in a single batch.' },
        { status: 400 }
      );
    }

    const result = await bulkImportMedicines(items);

    return NextResponse.json({
      success: true,
      added: result.added,
      updated: result.updated,
      totalProcessed: result.totalProcessed,
      message: `Successfully processed ${result.totalProcessed} medicines (${result.added} added, ${result.updated} updated).`,
    });
  } catch (err) {
    console.error('[medicines/import] POST failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import medicines.' },
      { status: 500 }
    );
  }
}
