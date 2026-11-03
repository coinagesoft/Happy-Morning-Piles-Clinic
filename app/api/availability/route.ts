import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getAllDoctorOverrides,
  getDoctorOverrideById,
  saveDoctorOverride,
  deleteDoctorOverride,
  getDoctorBlockedDates,
  DoctorOverride,
} from '@/lib/availability';
import { getScopedDoctorSlug, verifyAdminRequest } from '@/lib/adminAuth';
import { getDoctorBySlug } from '@/lib/doctorsTeam';

export const dynamic = 'force-dynamic';

/**
 * GET /api/availability
 * - ?doctor=<slug>  public: that doctor's leave + clinic-wide leave (booking form)
 * - no doctor, doctor login: their own leave + clinic-wide leave
 * - no doctor, admin / receptionist: every override
 * - no doctor, public: clinic-wide leave only
 */
export async function GET(request: NextRequest) {
  const doctorParam = request.nextUrl.searchParams.get('doctor')?.trim() || '';
  if (doctorParam && doctorParam !== 'default' && !getDoctorBySlug(doctorParam)) {
    return NextResponse.json({ error: 'Unknown doctor.' }, { status: 400 });
  }

  let doctorSlug: string | undefined;
  let seeAll = false;

  if (doctorParam && doctorParam !== 'default') {
    doctorSlug = doctorParam;
  } else if (!doctorParam) {
    const auth = verifyAdminRequest(request);
    if (auth.authenticated) {
      doctorSlug = getScopedDoctorSlug(auth.payload);
      seeAll = !doctorSlug;
    }
  }

  const [overrides, blockedDates] = await Promise.all([
    getAllDoctorOverrides({ doctorSlug, all: seeAll }),
    getDoctorBlockedDates(doctorSlug),
  ]);

  return NextResponse.json(
    { overrides, blockedDates, doctorSlug: doctorSlug || null },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
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
    const { date, type, blockedSlots, reason, doctorSlug: requestedDoctorSlug } = body;

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

    // A doctor login always blocks time for THEIR OWN calendar only.
    // Admin may pick a doctor; with none picked the block applies to the whole clinic.
    const scoped = getScopedDoctorSlug(auth.payload);
    let overrideDoctorSlug: string | undefined = scoped;
    if (!scoped && typeof requestedDoctorSlug === 'string' && requestedDoctorSlug.trim()) {
      const doctor = getDoctorBySlug(requestedDoctorSlug);
      if (!doctor) {
        return NextResponse.json({ error: 'Unknown doctor.' }, { status: 400 });
      }
      overrideDoctorSlug = doctor.slug;
    }

    const override: DoctorOverride = {
      id: crypto.randomUUID(),
      date,
      type,
      blockedSlots: type === 'specific_slots' ? blockedSlots : undefined,
      reason: (reason && typeof reason === 'string' && reason.trim()) || 'Doctor unavailable',
      doctorSlug: overrideDoctorSlug,
      createdAt: new Date().toISOString(),
    };

    await saveDoctorOverride(override);
    const overrides = await getAllDoctorOverrides({
      doctorSlug: scoped,
      all: !scoped,
    });

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

    // A doctor can only remove their own blocks (or an older clinic-wide one), never another doctor's.
    const scoped = getScopedDoctorSlug(auth.payload);
    const existing = await getDoctorOverrideById(id);
    if (scoped && existing?.doctorSlug && existing.doctorSlug !== scoped) {
      return NextResponse.json(
        { error: 'This leave / blackout belongs to another doctor.' },
        { status: 403 }
      );
    }

    await deleteDoctorOverride(id);
    const overrides = await getAllDoctorOverrides({ doctorSlug: scoped, all: !scoped });

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