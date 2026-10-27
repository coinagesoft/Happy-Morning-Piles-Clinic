import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getAllDoctorOverrides,
  saveDoctorOverride,
  deleteDoctorOverride,
  getDoctorBlockedDates,
  DoctorOverride,
} from '@/lib/availability';
import { verifyAdminRequest } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [overrides, blockedDates] = await Promise.all([
    getAllDoctorOverrides(),
    getDoctorBlockedDates(),
  ]);

  return NextResponse.json(
    {
      overrides,
      blockedDates,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['doctor', 'admin']);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access. Doctor credentials required.' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const body = await request.json();
    const { date, type, blockedSlots, reason } = body;

    if (!date || typeof date !== 'string') {
      return NextResponse.json(
        { error: 'Date is required (YYYY-MM-DD).' },
        { status: 400 }
      );
    }

    if (type !== 'full_day' && type !== 'specific_slots') {
      return NextResponse.json(
        { error: 'Type must be either "full_day" or "specific_slots".' },
        { status: 400 }
      );
    }

    if (type === 'specific_slots' && (!Array.isArray(blockedSlots) || blockedSlots.length === 0)) {
      return NextResponse.json(
        { error: 'At least one time slot must be selected for specific_slots blackout.' },
        { status: 400 }
      );
    }

    const override: DoctorOverride = {
      id: crypto.randomUUID(),
      date,
      type,
      blockedSlots: type === 'specific_slots' ? blockedSlots : undefined,
      reason: (reason && typeof reason === 'string' && reason.trim()) || 'Doctor unavailable',
      createdAt: new Date().toISOString(),
    };

    await saveDoctorOverride(override);
    const overrides = await getAllDoctorOverrides();

    return NextResponse.json(
      {
        message: 'Doctor availability override saved successfully.',
        override,
        overrides,
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    console.error('Error saving doctor availability override:', err);
    return NextResponse.json(
      { error: 'Failed to save doctor availability override.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = verifyAdminRequest(request, ['doctor', 'admin']);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access. Doctor credentials required.' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Override ID is required.' },
        { status: 400 }
      );
    }

    const overrides = await deleteDoctorOverride(id);

    return NextResponse.json(
      {
        message: 'Doctor availability override removed successfully.',
        overrides,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    console.error('Error removing doctor availability override:', err);
    return NextResponse.json(
      { error: 'Failed to remove availability override.' },
      { status: 500 }
    );
  }
}
