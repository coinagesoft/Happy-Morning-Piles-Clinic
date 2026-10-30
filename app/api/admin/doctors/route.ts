import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_USERS, verifyAdminRequest } from '@/lib/adminAuth';
import {
  MIN_PASSWORD_LENGTH,
  createDoctor,
  deleteDoctor,
  getDoctorByEmail,
  getDoctorById,
  listDoctors,
  updateDoctor,
  type DoctorInput,
} from '@/lib/doctors';

export const dynamic = 'force-dynamic';

// Only the Super Admin (role "admin") may manage doctors.
const SUPER_ADMIN_ONLY: ['admin'] = ['admin'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function deny(auth: ReturnType<typeof verifyAdminRequest>) {
  return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 401 });
}

function parseLocations(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') return value.split(',');
  return [];
}

function readInput(body: Record<string, unknown>): DoctorInput {
  return {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    specialization: String(body.specialization || '').trim(),
    qualification: String(body.qualification || '').trim(),
    registrationNo: String(body.registrationNo || '').trim(),
    locations: parseLocations(body.locations),
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  };
}

function validate(input: DoctorInput): string | null {
  if (!input.name) return 'Doctor name is required.';
  if (!input.email || !EMAIL_RE.test(input.email)) return 'A valid login email is required.';
  return null;
}

function isReservedEmail(email: string): boolean {
  return ADMIN_USERS.some((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request, SUPER_ADMIN_ONLY);
  if (!auth.authenticated) return deny(auth);

  try {
    return NextResponse.json({ doctors: await listDoctors() });
  } catch (err) {
    console.error('List doctors error:', err);
    return NextResponse.json({ error: 'Failed to load doctors.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = verifyAdminRequest(request, SUPER_ADMIN_ONLY);
  if (!auth.authenticated || !auth.payload) return deny(auth);

  try {
    const body = await request.json();
    const input = readInput(body);
    let password = String(body.password || '');

    // "Add me as a doctor": the Super Admin lists their own account as a doctor.
    // They keep signing in with their Super Admin login, so no password is needed.
    const linkSelf = body.linkSelf === true;
    if (linkSelf) {
      input.email = auth.payload.email.trim().toLowerCase();
      if (!input.name) input.name = auth.payload.name;
      password = crypto.randomBytes(24).toString('hex');
      if (await getDoctorByEmail(input.email)) {
        return NextResponse.json({ error: 'You are already listed as a doctor.' }, { status: 409 });
      }
    }

    const problem = validate(input);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }
    if (
      (!linkSelf && isReservedEmail(input.email)) ||
      (!linkSelf && (await getDoctorByEmail(input.email)))
    ) {
      return NextResponse.json(
        { error: 'This email is already used by another login.' },
        { status: 409 }
      );
    }

    const doctor = await createDoctor(input, password);
    return NextResponse.json({ doctor }, { status: 201 });
  } catch (err) {
    console.error('Create doctor error:', err);
    return NextResponse.json({ error: 'Failed to add doctor.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = verifyAdminRequest(request, SUPER_ADMIN_ONLY);
  if (!auth.authenticated) return deny(auth);

  try {
    const body = await request.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Doctor id is required.' }, { status: 400 });

    const input = readInput(body);
    const problem = validate(input);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // Blank password = keep the current one.
    const newPassword = String(body.password || '');
    if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const current = await getDoctorById(id);
    if (!current) return NextResponse.json({ error: 'Doctor not found.' }, { status: 404 });

    // A profile linked to a built-in login (e.g. the Super Admin's own) keeps that email
    // and its password is managed by the built-in login, not here.
    const linkedToBuiltIn = isReservedEmail(current.email);
    if (linkedToBuiltIn) input.email = current.email;

    const sameEmailDoctor = await getDoctorByEmail(input.email);
    if (
      (!linkedToBuiltIn && isReservedEmail(input.email)) ||
      (sameEmailDoctor && sameEmailDoctor.id !== id)
    ) {
      return NextResponse.json(
        { error: 'This email is already used by another login.' },
        { status: 409 }
      );
    }

    const doctor = await updateDoctor(
      id,
      input,
      linkedToBuiltIn ? undefined : newPassword || undefined
    );
    if (!doctor) return NextResponse.json({ error: 'Doctor not found.' }, { status: 404 });
    return NextResponse.json({ doctor });
  } catch (err) {
    console.error('Update doctor error:', err);
    return NextResponse.json({ error: 'Failed to update doctor.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = verifyAdminRequest(request, SUPER_ADMIN_ONLY);
  if (!auth.authenticated) return deny(auth);

  try {
    const id = request.nextUrl.searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Doctor id is required.' }, { status: 400 });

    const removed = await deleteDoctor(id);
    if (!removed) return NextResponse.json({ error: 'Doctor not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete doctor error:', err);
    return NextResponse.json({ error: 'Failed to delete doctor.' }, { status: 500 });
  }
}