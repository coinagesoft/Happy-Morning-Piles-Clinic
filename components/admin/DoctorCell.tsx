'use client';

import React from 'react';
import { BOOKABLE_DOCTORS, getDoctorBySlug } from '@/lib/doctorsTeam';

interface DoctorCellProps {
  slug?: string | null;
  name?: string | null;
  patientName: string;
  /** Admin / receptionist: can assign or change the doctor from the chip itself. */
  canAssignAny: boolean;
  /** Logged-in doctor's slug (doctor logins only). */
  userDoctorSlug?: string;
  cancelled?: boolean;
  onAssign: (doctorSlug: string) => void;
}

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23565ACF' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/**
 * Doctor column for the appointments table: just the doctor's name as a clean chip.
 * For admin / receptionist the chip itself is the (only) control to assign or change the doctor.
 */
export default function DoctorCell({
  slug,
  name,
  patientName,
  canAssignAny,
  userDoctorSlug,
  cancelled,
  onAssign,
}: DoctorCellProps) {
  const doc = getDoctorBySlug(slug);
  const displayName = ((name && name.trim()) || doc?.name || '').trim();
  const assigned = !!displayName;

  const chipBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 999,
    padding: '7px 14px',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  };

  const assignedStyle: React.CSSProperties = {
    ...chipBase,
    color: '#3B3FA8',
    background: '#EEF0FF',
    border: '1px solid #D9DCFF',
  };

  const unassignedStyle: React.CSSProperties = {
    ...chipBase,
    fontWeight: 600,
    color: '#64748b',
    background: '#F8FAFC',
    border: '1px dashed #CBD5E1',
  };

  const dot = (color: string) => (
    <span
      aria-hidden="true"
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  );

  // Admin / receptionist: the chip is a select
  if (canAssignAny) {
    const extra = slug && !BOOKABLE_DOCTORS.some((d) => d.slug === slug);
    return (
      <select
        value={slug || ''}
        onChange={(e) => onAssign(e.target.value)}
        aria-label={`Doctor for ${patientName}`}
        title="Click to assign or change the doctor"
        style={{
          ...(assigned ? assignedStyle : unassignedStyle),
          appearance: 'none',
          WebkitAppearance: 'none',
          cursor: 'pointer',
          minWidth: 170,
          paddingRight: 32,
          backgroundImage: CHEVRON,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          backgroundSize: '12px',
          fontFamily: 'inherit',
        }}
      >
        <option value="">Assign doctor</option>
        {extra && <option value={slug || ''}>{displayName || slug}</option>}
        {BOOKABLE_DOCTORS.map((d) => (
          <option key={d.slug} value={d.slug}>
            {d.name}
          </option>
        ))}
      </select>
    );
  }

  // Doctor login: unassigned patient -> one-click "Assign to me"
  if (!assigned && userDoctorSlug && !cancelled) {
    return (
      <button
        type="button"
        onClick={() => onAssign(userDoctorSlug)}
        title="Take this patient as your own"
        style={{
          ...chipBase,
          color: '#fff',
          background: '#565ACF',
          border: '1px solid #565ACF',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        + Assign to me
      </button>
    );
  }

  // Read-only chip
  return assigned ? (
    <span style={assignedStyle}>
      {dot('#565ACF')}
      {displayName}
    </span>
  ) : (
    <span style={unassignedStyle} title="No doctor selected for this booking">
      {dot('#CBD5E1')}
      Not assigned
    </span>
  );
}
