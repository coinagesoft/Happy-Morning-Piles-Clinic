'use client';

import React from 'react';
import { getDoctorBySlug } from '@/lib/doctorsTeam';

interface DoctorBadgeProps {
  /** Doctor slug saved with the appointment (appointment.doctorSlug) */
  slug?: string | null;
  /** Doctor name saved with the appointment (appointment.doctorName) */
  name?: string | null;
  /** 'full' = photo + name + role (tables, cards). 'compact' = one short line (calendar chips). */
  variant?: 'full' | 'compact';
}

function initials(name: string): string {
  const clean = name.replace(/^dr\.?\s*/i, '').trim();
  return (clean.charAt(0) || '?').toUpperCase();
}

/**
 * Shows which doctor an appointment is booked with.
 * Older bookings (made before doctor selection existed) show "Not assigned".
 */
export default function DoctorBadge({ slug, name, variant = 'full' }: DoctorBadgeProps) {
  const doc = getDoctorBySlug(slug);
  const displayName = ((name && name.trim()) || doc?.name || '').trim();

  if (!displayName) {
    return (
      <span
        title="No doctor was selected for this booking"
        style={{
          display: 'inline-block',
          fontSize: variant === 'compact' ? 10 : 12,
          fontWeight: 600,
          color: '#64748b',
          background: 'rgba(100,116,139,0.12)',
          borderRadius: 999,
          padding: variant === 'compact' ? '1px 6px' : '3px 10px',
          whiteSpace: 'nowrap',
        }}
      >
        Not assigned
      </span>
    );
  }

  if (variant === 'compact') {
    const short = displayName.split(/\s+/).slice(0, 2).join(' ');
    return (
      <span
        title={`Doctor: ${displayName}`}
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1.3,
          opacity: 0.85,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        🩺 {short}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {doc?.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={doc.photo}
          alt=""
          width={30}
          height={30}
          style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: '#EEF0FF',
            color: '#565ACF',
            fontWeight: 700,
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {initials(displayName)}
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
        <strong style={{ fontSize: 13 }}>{displayName}</strong>
        {doc?.role && <small style={{ fontSize: 11, color: '#64748b' }}>{doc.role}</small>}
      </span>
    </span>
  );
}
