import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import { bulkImportCategories } from '@/lib/medicineCategories';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function unauthorized(error?: string) {
  return NextResponse.json({ error: error || 'Unauthorized access.' }, { status: 401 });
}

// POST /api/admin/medicines/categories/import — Bulk import categories from Excel / CSV
export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No category rows provided to import.' },
        { status: 400 }
      );
    }

    if (items.length > 2000) {
      return NextResponse.json(
        { error: 'Cannot import more than 2,000 categories in a single batch.' },
        { status: 400 }
      );
    }

    const result = await bulkImportCategories(items);

    return NextResponse.json({
      success: true,
      added: result.added,
      updated: result.updated,
      totalProcessed: result.totalProcessed,
      message: `Successfully processed ${result.totalProcessed} categories (${result.added} added, ${result.updated} updated).`,
    });
  } catch (err) {
    console.error('[medicines/categories/import] POST failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import categories.' },
      { status: 500 }
    );
  }
}

