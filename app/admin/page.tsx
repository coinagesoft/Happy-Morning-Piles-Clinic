'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Appointment } from '@/lib/storage';
import { DoctorOverride } from '@/lib/availability';
import {
  AdminTabType,
  AdminUser,
  AdminStats,
  PatientGroup,
  RevenueData,
  FollowUpRecord,
} from '@/components/admin/types';

// Admin Modular Components & Tabs
import AdminLoginView from '@/components/admin/AdminLoginView';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminOverviewTab from '@/components/admin/tabs/AdminOverviewTab';
import AdminAppointmentsTab from '@/components/admin/tabs/AdminAppointmentsTab';
import AdminPatientsTab from '@/components/admin/tabs/AdminPatientsTab';
import AdminPaymentsTab from '@/components/admin/tabs/AdminPaymentsTab';
import DoctorAvailabilityManager from '@/components/admin/DoctorAvailabilityManager';
import PatientHistoryModal from '@/components/admin/PatientHistoryModal';
import AdminBookAppointmentModal from '@/components/admin/AdminBookAppointmentModal';
import AdminRescheduleModal from '@/components/admin/AdminRescheduleModal';
import PrescriptionModal from '@/components/admin/PrescriptionModal';
import AdminMedicinesTab from '@/components/admin/tabs/AdminMedicinesTab';
import { Medicine } from '@/lib/medicines';
import { toast } from '@/components/ui/Toast';

// Customer identity resolution helpers
function getCustomerKey(email?: string, phone?: string): string {
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  if (cleanEmail) return cleanEmail;
  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '').slice(-10) : '';
  return cleanPhone ? `phone:${cleanPhone}` : 'unknown';
}

function pickBestName(existing: string, candidate: string): string {
  if (!existing) return candidate;
  if (!candidate) return existing;
  return candidate.trim().length > existing.trim().length ? candidate.trim() : existing;
}

function pickBestPhone(existing: string, candidate: string): string {
  if (!existing) return candidate;
  if (!candidate) return existing;
  if (candidate.startsWith('+') && !existing.startsWith('+')) return candidate;
  return candidate.length > existing.length ? candidate : existing;
}

export default function AdminPage() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<AdminTabType>('overview');

  // Appointments Data
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    totalCount: 0,
    confirmedCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
    uniquePatients: 0,
  });
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

  // Filters for Appointments Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'offline' | 'online'>('all');
  const [apptViewMode, setApptViewMode] = useState<'table' | 'calendar'>('table');

  // Admin Book Appointment Modal State
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookingDate, setBookingDate] = useState('');

  // Admin Reschedule Appointment Drawer State
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);

  // Follow-up dates set on prescriptions (shown in the Patient Directory)
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);

  // Prescription Modal State
  const [prescriptionAppointment, setPrescriptionAppointment] = useState<Appointment | null>(null);

  // Revenue Analytics Data
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);

  // Doctor Availability Overrides
  const [overrides, setOverrides] = useState<DoctorOverride[]>([]);

  // Medicines Database State
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoadingMedicines, setIsLoadingMedicines] = useState(false);

  // Selected Patient for History Modal
  const [selectedPatient, setSelectedPatient] = useState<PatientGroup | null>(null);

  // Refresh JWT tokens using /api/admin/auth/refresh
  const refreshAdminTokens = useCallback(async (): Promise<string | null> => {
    try {
      const storedRefreshToken = localStorage.getItem('admin_refresh_token');
      const res = await fetch('/api/admin/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!res.ok) {
        localStorage.removeItem('admin_access_token');
        localStorage.removeItem('admin_refresh_token');
        setIsAuthenticated(false);
        setAdminUser(null);
        return null;
      }

      const data = await res.json();
      if (data.accessToken) {
        localStorage.setItem('admin_access_token', data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem('admin_refresh_token', data.refreshToken);
        }
        if (data.user) {
          setAdminUser(data.user);
        }
        setIsAuthenticated(true);
        return data.accessToken;
      }
      return null;
    } catch (err) {
      console.error('Failed to refresh admin JWT token:', err);
      setIsAuthenticated(false);
      setAdminUser(null);
      return null;
    }
  }, []);

  // Authorized fetch wrapper for Admin API endpoints
  const adminFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      let token = localStorage.getItem('admin_access_token');
      const headers = new Headers(init.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init.headers = headers;
      init.credentials = 'same-origin';

      let res = await fetch(input, init);

      if (res.status === 401) {
        const refreshedToken = await refreshAdminTokens();
        if (refreshedToken) {
          const retryHeaders = new Headers(init.headers || {});
          retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
          init.headers = retryHeaders;
          res = await fetch(input, init);
        }
      }
      return res;
    },
    [refreshAdminTokens]
  );

  // Verify Active Session on Mount
  useEffect(() => {
    async function checkExistingSession() {
      setIsCheckingSession(true);
      try {
        const token = localStorage.getItem('admin_access_token');
        const res = await fetch('/api/admin/auth/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'same-origin',
        });

        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setAdminUser(data.user);
            setIsAuthenticated(true);
          }
        } else {
          const refreshedToken = await refreshAdminTokens();
          if (refreshedToken) {
            setIsAuthenticated(true);
          }
        }
      } catch (err) {
        console.error('Session verification error:', err);
      } finally {
        setIsCheckingSession(false);
      }
    }

    checkExistingSession();
  }, [refreshAdminTokens]);

  // Handle Login Form Submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmittingLogin(true);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const err = data.error || 'Invalid email or password.';
        setLoginError(err);
        toast.error(err, 'Login Failed');
        return;
      }

      if (data.accessToken) {
        localStorage.setItem('admin_access_token', data.accessToken);
      }
      if (data.refreshToken) {
        localStorage.setItem('admin_refresh_token', data.refreshToken);
      }
      if (data.user) {
        setAdminUser(data.user);
      }

      setIsAuthenticated(true);
      setPassword('');
      setLoginError('');
      toast.success('Logged in successfully. Welcome back!', 'Welcome');
    } catch (err) {
      console.error('Admin login error:', err);
      const netErr = 'Network error while connecting to authentication server.';
      setLoginError(netErr);
      toast.error(netErr, 'Login Error');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch (err) {
      console.error('Error logging out:', err);
    } finally {
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_refresh_token');
      localStorage.removeItem('clinic_doctor_logged_in');
      setIsAuthenticated(false);
      setAdminUser(null);
      toast.info('You have been logged out of the admin portal.', 'Logged Out');
    }
  };

  // Fetch Appointments & Stats (Fast In-Memory Cache with force-fresh)
  const loadAppointments = useCallback(() => {
    setIsLoadingAppointments(true);
    adminFetch(`/api/admin/appointments?_t=${Date.now()}&fresh=true`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.appointments) setAppointments(data.appointments);
        if (data.stats) setStats(data.stats);
      })
      .catch((err) => console.error('Failed to load admin appointments:', err))
      .finally(() => setIsLoadingAppointments(false));
  }, [adminFetch]);

  // Fetch follow-up dates from prescriptions
  const loadFollowUps = useCallback(() => {
    adminFetch(`/api/admin/follow-ups?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.followUps)) setFollowUps(data.followUps);
      })
      .catch((err) => console.error('Failed to load follow-ups:', err));
  }, [adminFetch]);

  // Fetch Revenue Analytics
  const loadRevenue = useCallback(() => {
    adminFetch(`/api/admin/revenue?_t=${Date.now()}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.summary) setRevenueData(data);
      })
      .catch((err) => console.error('Failed to load revenue analytics:', err));
  }, [adminFetch]);

  // Fetch Doctor Overrides
  const loadOverrides = useCallback(() => {
    return adminFetch(`/api/availability?_t=${Date.now()}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.overrides)) setOverrides(data.overrides);
      })
      .catch((err) => console.error('Failed to load doctor availability:', err));
  }, [adminFetch]);

  // Fetch Medicines Database
  const loadMedicines = useCallback(() => {
    setIsLoadingMedicines(true);
    adminFetch(`/api/admin/medicines?_t=${Date.now()}`, {
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.medicines)) setMedicines(data.medicines);
      })
      .catch((err) => console.error('Failed to load medicines:', err))
      .finally(() => setIsLoadingMedicines(false));
  }, [adminFetch]);

  // Role-Based Access Control State
  const role = adminUser?.role || 'doctor';
  const isReceptionist = role === 'receptionist';
  const isPharmacist = role === 'pharmacist';
  const isDoctor = !isReceptionist && !isPharmacist;

  // Auto-redirect if user lands on an unauthorized tab
  useEffect(() => {
    if (isReceptionist && !['appointments', 'patients', 'payments'].includes(activeTab)) {
      setActiveTab('appointments');
    } else if (isPharmacist && activeTab !== 'medicines') {
      setActiveTab('medicines');
    }
  }, [isReceptionist, isPharmacist, activeTab]);

  // Initial Data Load on Authentication based on role
  useEffect(() => {
    if (isAuthenticated) {
      if (isDoctor) {
        loadAppointments();
        loadRevenue();
        loadOverrides();
        loadMedicines();
        loadFollowUps();
      } else if (isReceptionist) {
        loadAppointments();
        loadOverrides();
        loadFollowUps();
      } else if (isPharmacist) {
        loadMedicines();
      }
    }
  }, [isAuthenticated, isDoctor, isReceptionist, isPharmacist, loadAppointments, loadRevenue, loadOverrides, loadMedicines, loadFollowUps]);

  // Update Appointment Status (Instant Optimistic UI + Server Sync)
  const handleUpdateStatus = async (
    id: string,
    status: 'confirmed' | 'completed' | 'cancelled'
  ) => {
    // 1. Instantly update UI optimistically in local state
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    if (selectedPatient) {
      setSelectedPatient((prev) =>
        prev
          ? {
              ...prev,
              appointments: prev.appointments.map((a) =>
                a.id === id ? { ...a, status } : a
              ),
            }
          : null
      );
    }

    try {
      const res = await adminFetch('/api/admin/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.appointment) {
          setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...data.appointment } : a))
          );
        }
        loadRevenue();
        const readableStatus = status.charAt(0).toUpperCase() + status.slice(1);
        toast.success(`Appointment status updated to ${readableStatus}.`, 'Status Updated');
      } else {
        // Revert on failure
        loadAppointments();
        toast.error('Failed to update appointment status. Reverting changes.', 'Status Update Failed');
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      loadAppointments();
      toast.error('Network error while updating appointment status.', 'Status Update Failed');
    }
  };

  // Update Payment Status (Instant Optimistic UI + Server Sync)
  const handleUpdatePayment = async (
    id: string,
    paymentStatus: 'paid' | 'pending' | 'refunded'
  ) => {
    // 1. Instantly update UI optimistically in local state
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              paymentStatus,
              paidAt: paymentStatus === 'paid' ? new Date().toISOString() : a.paidAt,
            }
          : a
      )
    );
    if (selectedPatient) {
      setSelectedPatient((prev) =>
        prev
          ? {
              ...prev,
              appointments: prev.appointments.map((a) =>
                a.id === id ? { ...a, paymentStatus } : a
              ),
            }
          : null
      );
    }

    try {
      const res = await adminFetch('/api/admin/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, paymentStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.appointment) {
          setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...data.appointment } : a))
          );
        }
        loadRevenue();
        toast.success(
          paymentStatus === 'paid'
            ? 'Payment successfully marked as Paid (₹800).'
            : `Payment status updated to ${paymentStatus}.`,
          'Payment Updated'
        );
      } else {
        loadAppointments();
        toast.error('Failed to update payment status. Reverting changes.', 'Payment Update Failed');
      }
    } catch (err) {
      console.error('Failed to update payment status:', err);
      loadAppointments();
      toast.error('Network error while updating payment status.', 'Payment Update Failed');
    }
  };

  // Update Notes (Instant Optimistic UI + Server Sync)
  const handleUpdateNotes = async (id: string, notes: string) => {
    // 1. Instantly update UI optimistically in local state
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, notes } : a))
    );
    if (selectedPatient) {
      setSelectedPatient((prev) =>
        prev
          ? {
              ...prev,
              appointments: prev.appointments.map((a) =>
                a.id === id ? { ...a, notes } : a
              ),
            }
          : null
      );
    }

    try {
      const res = await adminFetch('/api/admin/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.appointment) {
          setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...data.appointment } : a))
          );
        }
        toast.success('Clinical prescription notes saved successfully.', 'Notes Saved');
      } else {
        toast.error('Failed to save clinical notes.', 'Save Failed');
      }
    } catch (err) {
      console.error('Failed to update notes:', err);
      loadAppointments();
      toast.error('Network error while saving clinical notes.', 'Save Failed');
    }
  };

  // Delete Appointment
  const handleDeleteAppointment = async (id: string, patientName: string) => {
    if (!confirm(`Are you sure you want to cancel and remove the appointment for ${patientName}?`)) {
      return;
    }
    try {
      const res = await adminFetch(`/api/admin/appointments?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadAppointments();
        loadRevenue();
        toast.success(`Appointment for ${patientName} has been cancelled and removed.`, 'Appointment Cancelled');
      } else {
        toast.error('Failed to delete appointment. Please try again.', 'Delete Failed');
      }
    } catch (err) {
      console.error('Failed to delete appointment:', err);
      toast.error('Network error while deleting appointment.', 'Delete Failed');
    }
  };

  // Group Appointments by Unique Customer (Same email = same customer)
  const patientDirectory = useMemo(() => {
    const map = new Map<string, PatientGroup>();

    appointments.forEach((appt) => {
      const key = getCustomerKey(appt.email, appt.phone);
      const existing = map.get(key);
      if (existing) {
        existing.appointments.push(appt);
        existing.fullName = pickBestName(existing.fullName, appt.fullName);
        existing.phone = pickBestPhone(existing.phone, appt.phone);
        if (!existing.age && appt.age) existing.age = appt.age;
      } else {
        map.set(key, {
          fullName: appt.fullName,
          phone: appt.phone,
          email: appt.email,
          age: appt.age,
          appointments: [appt],
        });
      }
    });

    return Array.from(map.values());
  }, [appointments]);

  const findPatientGroup = useCallback(
    (appt: Appointment): PatientGroup => {
      const key = getCustomerKey(appt.email, appt.phone);
      const found = patientDirectory.find((p) => getCustomerKey(p.email, p.phone) === key);
      return (
        found || {
          fullName: appt.fullName,
          phone: appt.phone,
          email: appt.email,
          age: appt.age,
          appointments: [appt],
        }
      );
    },
    [patientDirectory]
  );

  // If Not Authenticated, Render Dedicated Login Component
  if (!isAuthenticated) {
    return (
      <AdminLoginView
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        isSubmittingLogin={isSubmittingLogin}
        isCheckingSession={isCheckingSession}
        loginError={loginError}
        onSubmit={handleLogin}
      />
    );
  }

  // Render Authenticated Admin Dashboard
  return (
    <div className="admin-portal-wrapper">
      {/* Topbar & Tab Navigation Header */}
      <AdminHeader
        adminUser={adminUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalAppointments={stats.totalCount}
        totalPatients={patientDirectory.length}
        totalOverrides={overrides.length}
        totalMedicines={medicines.length}
        onQuickBook={() => {
          setBookingDate('');
          setShowBookModal(true);
        }}
        onLogout={handleLogout}
        adminFetch={adminFetch}
      />

      {/* Main Admin Content Tab Panes */}
      <main className="admin-main-container container">
        {activeTab === 'overview' && isDoctor && (
          <AdminOverviewTab
            stats={stats}
            patientCount={patientDirectory.length}
            revenueData={revenueData}
            overridesCount={overrides.length}
          />
        )}

        {activeTab === 'appointments' && (isDoctor || isReceptionist) && (
          <AdminAppointmentsTab
            userRole={role}
            appointments={appointments}
            stats={stats}
            overrides={overrides}
            isLoading={isLoadingAppointments}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            modeFilter={modeFilter}
            setModeFilter={setModeFilter}
            apptViewMode={apptViewMode}
            setApptViewMode={setApptViewMode}
            onRefresh={loadAppointments}
            onQuickBook={(dateIso) => {
              setBookingDate(dateIso || '');
              setShowBookModal(true);
            }}
            onSelectPatient={(appt) => setSelectedPatient(findPatientGroup(appt))}
            onReschedule={(appt) => setRescheduleAppointment(appt)}
            onPrescribe={(appt) => setPrescriptionAppointment(appt)}
            onUpdateStatus={handleUpdateStatus}
            onUpdatePayment={handleUpdatePayment}
            onDeleteAppointment={handleDeleteAppointment}
          />
        )}

        {activeTab === 'patients' && (isDoctor || isReceptionist) && (
          <AdminPatientsTab
            patients={patientDirectory}
            followUps={followUps}
            onSelectPatient={(patient) => setSelectedPatient(patient)}
          />
        )}

        {activeTab === 'payments' && (isDoctor || isReceptionist) && (
          <AdminPaymentsTab
            appointments={appointments}
            revenueData={revenueData}
          />
        )}

        {activeTab === 'availability' && isDoctor && (
          <div className="tab-pane-fade">
            <DoctorAvailabilityManager
              overrides={overrides}
              appointments={appointments}
              onOverridesChange={setOverrides}
              onRefresh={async () => {
                await loadOverrides();
                loadAppointments();
              }}
            />
          </div>
        )}

        {activeTab === 'medicines' && (isDoctor || isPharmacist) && (
          <AdminMedicinesTab
            userRole={role}
            medicines={medicines}
            isLoading={isLoadingMedicines}
            onRefresh={loadMedicines}
            adminFetch={adminFetch}
          />
        )}
      </main>

      {/* Patient Consultation History Modal */}
      {selectedPatient && (
        <PatientHistoryModal
          userRole={role}
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onUpdateNotes={handleUpdateNotes}
          onUpdateStatus={handleUpdateStatus}
          onReschedule={(appt) => setRescheduleAppointment(appt)}
        />
      )}

      {/* Admin Book Appointment & Cash Collection Slide-Over Drawer */}
      <AdminBookAppointmentModal
        isOpen={showBookModal}
        initialDate={bookingDate}
        appointments={appointments}
        overrides={overrides}
        onClose={() => setShowBookModal(false)}
        onSuccess={() => {
          loadAppointments();
          loadRevenue();
        }}
      />

      {/* Prescription: write, print, email (Doctor only) */}
      {prescriptionAppointment && isDoctor && (
        <PrescriptionModal
          appointment={prescriptionAppointment}
          adminFetch={adminFetch}
          availableMedicines={medicines}
          onSaved={loadFollowUps}
          onClose={() => setPrescriptionAppointment(null)}
        />
      )}

      {/* Admin Reschedule Appointment Slide-Over Drawer */}
      <AdminRescheduleModal
        appointment={rescheduleAppointment}
        appointments={appointments}
        overrides={overrides}
        onClose={() => setRescheduleAppointment(null)}
        onSuccess={() => {
          loadAppointments();
          loadRevenue();
        }}
      />
    </div>
  );
}