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
  IconPlus,
  IconExternalLink,
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
  onQuickBook,
  onLogout,
  adminFetch,
}: AdminHeaderProps) {
  return (
    <>
      {/* Top Header Bar */}
      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="admin-topbar-left">
            <Link href="/" className="admin-brand-link" title="Visit Public Website">
              <strong>Dr. Mahesh Shete</strong>
              <span>Admin Portal</span>
            </Link>
          </div>

          <div className="admin-topbar-right">
            <WhatsAppStatus adminFetch={adminFetch} />
            <button type="button" className="btn-logout" onClick={onLogout}>
              <IconLogOut />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Admin Tabs Navigation */}
      <nav className="admin-nav-tabs">
        <div className="container nav-tabs-container">
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <IconOverview />
            <span>Overview &amp; Analytics</span>
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            <IconCalendar />
            <span>Appointments &amp; Bookings</span>
            <span className="tab-counter">{totalAppointments}</span>
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'patients' ? 'active' : ''}`}
            onClick={() => setActiveTab('patients')}
          >
            <IconUsers />
            <span>Patients Directory</span>
            <span className="tab-counter">{totalPatients}</span>
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <IconPayments />
            <span>Payments &amp; Revenue</span>
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'availability' ? 'active' : ''}`}
            onClick={() => setActiveTab('availability')}
          >
            <IconAvailability />
            <span>Doctor Availability</span>
            <span className="tab-counter counter-amber">{totalOverrides}</span>
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'medicines' ? 'active' : ''}`}
            onClick={() => setActiveTab('medicines')}
          >
            <IconMedicineBottle />
            <span>Medicines</span>
            {totalMedicines > 0 && (
              <span className="tab-counter counter-emerald">{totalMedicines}</span>
            )}
          </button>
        </div>
      </nav>
    </>
  );
}