import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import {
  getAllMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
} from '@/lib/medicines';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function unauthorized(error?: string) {
  return NextResponse.json({ error: error || 'Unauthorized access.' }, { status: 401 });
}

// GET /api/admin/medicines?q=...
export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const q = request.nextUrl.searchParams.get('q') || '';
    const medicines = await getAllMedicines(q);
    return NextResponse.json({ medicines, total: medicines.length });
  } catch (err) {
    console.error('[medicines] GET failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch medicines.' },
      { status: 500 }
    );
  }
}

// POST /api/admin/medicines — Create a new medicine
export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Medicine name is required.' }, { status: 400 });
    }

    const medicine = await createMedicine({
      name,
      potency: body.potency ? String(body.potency).trim() : '',
      form: body.form ? String(body.form).trim() : 'Dilution',
      category: body.category ? String(body.category).trim() : 'General',
      notes: body.notes ? String(body.notes).trim() : '',
    });

    return NextResponse.json({ success: true, medicine }, { status: 201 });
  } catch (err) {
    console.error('[medicines] POST failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create medicine.' },
      { status: 500 }
    );
  }
}

// PATCH / PUT /api/admin/medicines — Update / rename an existing medicine
export async function PATCH(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Medicine id is required.' }, { status: 400 });
    }

    const medicine = await updateMedicine(id, {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      potency: body.potency !== undefined ? String(body.potency).trim() : undefined,
      form: body.form !== undefined ? String(body.form).trim() : undefined,
      category: body.category !== undefined ? String(body.category).trim() : undefined,
      notes: body.notes !== undefined ? String(body.notes).trim() : undefined,
    });

    return NextResponse.json({ success: true, medicine });
  } catch (err) {
    console.error('[medicines] PATCH failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update medicine.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return PATCH(request);
}

// DELETE /api/admin/medicines?id=...
export async function DELETE(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const id = request.nextUrl.searchParams.get('id') || '';
    if (!id) {
      return NextResponse.json({ error: 'Medicine ID is required.' }, { status: 400 });
    }

    const success = await deleteMedicine(id);
    if (!success) {
      return NextResponse.json({ error: 'Medicine not found or already deleted.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[medicines] DELETE failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete medicine.' },
      { status: 500 }
    );
  }
}
