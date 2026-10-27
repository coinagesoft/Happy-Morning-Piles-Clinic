import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/medicineCategories';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function unauthorized(error?: string) {
  return NextResponse.json({ error: error || 'Unauthorized access.' }, { status: 401 });
}

// GET /api/admin/medicines/categories — Get list of all categories with medicine counts
export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const categories = await getAllCategories();
    return NextResponse.json({ categories, total: categories.length });
  } catch (err) {
    console.error('[medicines/categories] GET failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch categories.' },
      { status: 500 }
    );
  }
}

// POST /api/admin/medicines/categories — Create a new category manually
export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const category = await createCategory({
      name,
      description: body.description ? String(body.description).trim() : '',
    });

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (err) {
    console.error('[medicines/categories] POST failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create category.' },
      { status: 500 }
    );
  }
}

// PATCH / PUT /api/admin/medicines/categories — Update / rename a category
export async function PATCH(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Category id is required.' }, { status: 400 });
    }

    const category = await updateCategory(id, {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      description: body.description !== undefined ? String(body.description).trim() : undefined,
    });

    return NextResponse.json({ success: true, category });
  } catch (err) {
    console.error('[medicines/categories] PATCH failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update category.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return PATCH(request);
}

// DELETE /api/admin/medicines/categories?id=... — Delete a category
export async function DELETE(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) return unauthorized(auth.error);

  try {
    const id = request.nextUrl.searchParams.get('id') || '';
    if (!id) {
      return NextResponse.json({ error: 'Category ID is required.' }, { status: 400 });
    }

    const success = await deleteCategory(id);
    if (!success) {
      return NextResponse.json(
        { error: 'Category not found or already deleted.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[medicines/categories] DELETE failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete category.' },
      { status: 500 }
    );
  }
}

