'use client';

import React from 'react';
import Link from 'next/link';
import {
  IconOverview,
  IconCalendar,
  IconUsers,
  IconPayments,
  IconAvailability,
  IconMedicineBottle,
  IconLogOut,
} from './AdminIcons';
import { AdminTabType, AdminUser } from './types';
import WhatsAppStatus from './WhatsAppStatus';

interface AdminHeaderProps {
  adminUser: AdminUser | null;
  activeTab: AdminTabType;
  setActiveTab: (tab: AdminTabType) => void;
  totalAppointments: number;
  totalPatients: number;
  totalOverrides: number;
  totalMedicines?: number;
  onQuickBook: () => void;
  onLogout: () => void;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export default function AdminHeader({
  adminUser,
  activeTab,
  setActiveTab,
  totalAppointments,
  totalPatients,
  totalOverrides,
  totalMedicines = 0,
  onLogout,
  adminFetch,
}: AdminHeaderProps) {
  const role = adminUser?.role || 'doctor';
  const isReceptionist = role === 'receptionist';
  const isPharmacist = role === 'pharmacist';
  const isDoctor = !isReceptionist && !isPharmacist;
  const isSuperAdmin = role === 'admin';

  return (
    <>
      {/* Top Header Bar */}
      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="admin-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href="/" className="admin-brand-link" title="Visit Public Website">
              <strong>Happy Morning Clinic</strong>
              <span>Management Portal</span>
            </Link>

            {/* Role Badge Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isSuperAdmin && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: '#FDF2F8',
                    border: '1px solid #FBCFE8',
                    color: '#9D174D',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    letterSpacing: '0.3px',
                  }}
                  title="Super Admin: manage doctors plus full clinical, financial & administrative access"
                >
                  <span>👑</span>
                  <span>Super Admin</span>
                </span>
              )}

              {isDoctor && !isSuperAdmin && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: '#EEF2FF',
                    border: '1px solid #C7D2FE',
                    color: '#4338CA',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    letterSpacing: '0.3px',
                  }}
                  title="Full Clinical, Financial & Administrative Access"
                >
                  <span>🩺</span>
                  <span>Doctor</span>
                </span>
              )}

              {isReceptionist && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: '#FEF3C7',
                    border: '1px solid #FDE68A',
                    color: '#92400E',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    letterSpacing: '0.3px',
                  }}
                  title="Front Desk View: Scheduling, Check-ins, Patient Directory & Primary Billing"
                >
                  <span>📋</span>
                  <span>Receptionist (Front-Desk)</span>
                </span>
              )}

              {isPharmacist && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    color: '#065F46',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    letterSpacing: '0.3px',
                  }}
                  title="Pharmacy View: Medicine Inventory, Stock Management & Dispensing"
                >
                  <span>💊</span>
                  <span>Pharmacist (Inventory)</span>
                </span>
              )}

              {adminUser?.email && (
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  ({adminUser.name || adminUser.email})
                </span>
              )}
            </div>
          </div>

          <div className="admin-topbar-right">
            {isDoctor && <WhatsAppStatus adminFetch={adminFetch} />}
            <button type="button" className="btn-logout" onClick={onLogout}>
              <IconLogOut />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Admin Tabs Navigation (Filtered by Role) */}
      <nav className="admin-nav-tabs">
        <div className="container nav-tabs-container">
          {/* Doctor Only: Overview & Financial Analytics */}
          {isDoctor && (
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <IconOverview />
              <span>Overview &amp; Analytics</span>
            </button>
          )}

          {/* Doctor & Receptionist: Appointments */}
          {(isDoctor || isReceptionist) && (
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
              onClick={() => setActiveTab('appointments')}
            >
              <IconCalendar />
              <span>Appointments &amp; Queue</span>
              <span className="tab-counter">{totalAppointments}</span>
            </button>
          )}

          {/* Doctor & Receptionist: Patients Directory */}
          {(isDoctor || isReceptionist) && (
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'patients' ? 'active' : ''}`}
              onClick={() => setActiveTab('patients')}
            >
              <IconUsers />
              <span>Patients Directory</span>
              <span className="tab-counter">{totalPatients}</span>
            </button>
          )}

          {/* Doctor & Receptionist: Payments & Billing */}
          {(isDoctor || isReceptionist) && (
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveTab('payments')}
            >
              <IconPayments />
              <span>Payments &amp; Billing</span>
            </button>
          )}

          {/* Doctor Only: Doctor Availability */}
          {isDoctor && (
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'availability' ? 'active' : ''}`}
              onClick={() => setActiveTab('availability')}
            >
              <IconAvailability />
              <span>Doctor Availability</span>
              <span className="tab-counter counter-amber">{totalOverrides}</span>
            </button>
          )}

          {/* Super Admin Only: Add / edit doctors */}
          {isSuperAdmin && (
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'doctors' ? 'active' : ''}`}
              onClick={() => setActiveTab('doctors')}
            >
              <IconUsers />
              <span>Doctors</span>
            </button>
          )}

          {/* Doctor & Pharmacist: Medicines & Inventory */}
          {(isDoctor || isPharmacist) && (
            <button
              type="button"
              className={`admin-tab-btn ${activeTab === 'medicines' ? 'active' : ''}`}
              onClick={() => setActiveTab('medicines')}
            >
              <IconMedicineBottle />
              <span>Medicines &amp; Inventory</span>
              {totalMedicines > 0 && (
                <span className="tab-counter counter-emerald">{totalMedicines}</span>
              )}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}