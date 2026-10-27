'use client';

import React from 'react';
import { Appointment } from '@/lib/storage';
import { DoctorOverride } from '@/lib/availability';
import AdminAppointmentCalendar from '@/components/admin/AdminAppointmentCalendar';
import {
  IconCalendar,
  IconRefresh,
  IconPlus,
  IconCross,
  IconTrash,
  IconFileText,
  IconVideo,
  IconBuilding,
  IconSearch,
  IconFilter,
  IconTable,
  IconPill,
} from '@/components/admin/AdminIcons';
import { AdminStats } from '@/components/admin/types';

interface AdminAppointmentsTabProps {
  userRole?: string;
  appointments: Appointment[];
  stats: AdminStats;
  overrides: DoctorOverride[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  timeFilter: string;
  setTimeFilter: (val: string) => void;
  modeFilter: 'all' | 'offline' | 'online';
  setModeFilter: (val: 'all' | 'offline' | 'online') => void;
  apptViewMode: 'table' | 'calendar';
  setApptViewMode: (val: 'table' | 'calendar') => void;
  onRefresh: () => void;
  onQuickBook: (dateIso?: string) => void;
  onSelectPatient: (appt: Appointment) => void;
  onReschedule: (appt: Appointment) => void;
  onPrescribe: (appt: Appointment) => void;
  onUpdateStatus: (
    id: string,
    status: 'confirmed' | 'completed' | 'cancelled'
  ) => void;
  onUpdatePayment: (
    id: string,
    paymentStatus: 'paid' | 'pending' | 'refunded'
  ) => void;
  onDeleteAppointment: (id: string, patientName: string) => void;
}

export default function AdminAppointmentsTab({
  userRole = 'doctor',
  appointments,
  stats,
  overrides,
  isLoading,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  timeFilter,
  setTimeFilter,
  modeFilter,
  setModeFilter,
  apptViewMode,
  setApptViewMode,
  onRefresh,
  onQuickBook,
  onSelectPatient,
  onReschedule,
  onPrescribe,
  onUpdateStatus,
  onUpdatePayment,
  onDeleteAppointment,
}: AdminAppointmentsTabProps) {
  const [sortBy, setSortBy] = React.useState<'latest' | 'oldest' | 'name' | 'amount'>('latest');

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    statusFilter !== 'all' ||
    timeFilter !== 'all' ||
    modeFilter !== 'all' ||
    sortBy !== 'latest';

  // Group appointments by unique email (or phone/id if no email)
  // Ensures same email does not repeat on this screen, and always presents the first booking name & mobile
  const deduplicatedAppointments = React.useMemo(() => {
    const groups = new Map<string, Appointment[]>();

    appointments.forEach((appt) => {
      const emailKey = (appt.email || '').trim().toLowerCase();
      const phoneKey = (appt.phone || '').replace(/\D/g, '').slice(-10);
      const key = emailKey || phoneKey || appt.id;
      const list = groups.get(key) || [];
      list.push(appt);
      groups.set(key, list);
    });

    const result: (Appointment & {
      totalBookingsCount: number;
      isRepeatPatient: boolean;
      allBookings: Appointment[];
      firstBooking: Appointment;
    })[] = [];

    groups.forEach((groupAppts) => {
      // 1. Find the earliest / first booking chronologically (by createdAt or date + time)
      const sortedChronological = [...groupAppts].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          const cmp = a.createdAt.localeCompare(b.createdAt);
          if (cmp !== 0) return cmp;
        }
        const dtA = `${a.date || ''}T${a.time || ''}`;
        const dtB = `${b.date || ''}T${b.time || ''}`;
        return dtA.localeCompare(dtB);
      });
      const firstBooking = sortedChronological[0];

      // 2. Representative appointment for calendar & schedule display:
      // Sort descending (latest date on top) to pick the most relevant / active appointment
      const sortedDescending = [...groupAppts].sort((a, b) => {
        const dtA = `${a.date || ''}T${a.time || ''}`;
        const dtB = `${b.date || ''}T${b.time || ''}`;
        return dtB.localeCompare(dtA);
      });
      const repAppt = sortedDescending[0];

      result.push({
        ...repAppt,
        // Enforce the first booking name, mobile, and age as requested
        fullName: firstBooking.fullName || repAppt.fullName,
        phone: firstBooking.phone || repAppt.phone,
        age: firstBooking.age || repAppt.age,
        totalBookingsCount: groupAppts.length,
        isRepeatPatient: groupAppts.length > 1,
        allBookings: groupAppts,
        firstBooking,
      });
    });

    return result;
  }, [appointments]);

  // Mapped appointments ensuring that even in Calendar view, the first booking name is displayed
  const calendarAppointments = React.useMemo(() => {
    const emailToFirstBooking = new Map<string, Appointment>();
    deduplicatedAppointments.forEach((d) => {
      const emailKey = (d.email || '').trim().toLowerCase();
      if (emailKey) emailToFirstBooking.set(emailKey, d.firstBooking);
    });

    return appointments.map((appt) => {
      const emailKey = (appt.email || '').trim().toLowerCase();
      const fb = emailKey ? emailToFirstBooking.get(emailKey) : null;
      if (fb) {
        return {
          ...appt,
          fullName: fb.fullName || appt.fullName,
          phone: fb.phone || appt.phone,
        };
      }
      return appt;
    });
  }, [appointments, deduplicatedAppointments]);

  const filteredAppointments = React.useMemo(() => {
    let result = [...deduplicatedAppointments];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (a) =>
          a.fullName.toLowerCase().includes(q) ||
          a.phone.includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.reason.toLowerCase().includes(q) ||
          (a.paymentId && a.paymentId.toLowerCase().includes(q)) ||
          a.allBookings.some(
            (b) =>
              (b.fullName && b.fullName.toLowerCase().includes(q)) ||
              (b.phone && b.phone.includes(q)) ||
              (b.reason && b.reason.toLowerCase().includes(q))
          )
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (timeFilter !== 'all') {
      const nowIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      if (timeFilter === 'today') {
        result = result.filter((a) => a.date === nowIso);
      } else if (timeFilter === 'upcoming') {
        result = result.filter((a) => a.date >= nowIso && a.status !== 'cancelled');
      } else if (timeFilter === 'past') {
        result = result.filter((a) => a.date < nowIso);
      }
    }
    if (modeFilter !== 'all') {
      result = result.filter((a) => a.consultationType === modeFilter);
    }

    // Sort order
    result.sort((a, b) => {
      const dtA = `${a.date}T${a.time}`;
      const dtB = `${b.date}T${b.time}`;
      if (sortBy === 'latest') return dtB.localeCompare(dtA);
      if (sortBy === 'oldest') return dtA.localeCompare(dtB);
      if (sortBy === 'name') return a.fullName.localeCompare(b.fullName);
      if (sortBy === 'amount') return (b.amount || 800) - (a.amount || 800);
      return 0;
    });

    return result;
  }, [deduplicatedAppointments, searchQuery, statusFilter, timeFilter, modeFilter, sortBy]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTimeFilter('all');
    setModeFilter('all');
    setSortBy('latest');
  };

  return (
    <div className="tab-pane-fade">
      {/* Appointments Header Row */}
      <div className="directory-header-row">
        <div>
          <h3 className="section-title">Appointments &amp; Bookings</h3>
          <p className="section-subtitle">
            Manage patient bookings, monitor daily clinic schedules, and coordinate consultations.
          </p>
        </div>

        {/* View Mode Toggle and Primary Actions */}
        <div className="appt-header-actions">
          <div className="view-mode-toggle" role="group" aria-label="Switch view format">
            <button
              type="button"
              className={`btn-view-toggle ${apptViewMode === 'table' ? 'active' : ''}`}
              onClick={() => setApptViewMode('table')}
              title="Tabular View"
            >
              <IconTable size={15} />
              <span>Table</span>
            </button>
            <button
              type="button"
              className={`btn-view-toggle ${apptViewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setApptViewMode('calendar')}
              title="Interactive Calendar View"
            >
              <IconCalendar size={15} />
              <span>Calendar</span>
            </button>
          </div>

          <button
            type="button"
            className="btn-admin-primary"
            onClick={() => onQuickBook()}
            title="Book new appointment"
          >
            <IconPlus />
            <span>Book Appointment</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="btn-reload"
            title="Refresh records"
          >
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Toolbar Card (Matches Patient Directory Design) */}
      <div className="directory-toolbar-card">
        <div className="directory-toolbar-grid appt-toolbar-grid">
          {/* 1. Live Search Input */}
          <div className="search-input-wrap">
            <span className="search-icon-box" aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="text"
              className="directory-search-input"
              placeholder="Search by patient name, phone, email, reason, payment ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setSearchQuery('')}
                title="Clear search query"
              >
                <IconCross />
              </button>
            )}
          </div>

          {/* 2. Consultation Mode Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconBuilding size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={modeFilter}
              onChange={(e) =>
                setModeFilter(e.target.value as 'all' | 'offline' | 'online')
              }
            >
              <option value="all">All Modes ({appointments.length})</option>
              <option value="offline">In-Clinic (Offline)</option>
              <option value="online">Online (Google Meet)</option>
            </select>
          </div>

          {/* 3. Status Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconFilter size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* 4. Timeframe Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconCalendar size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
            >
              <option value="all">All Dates</option>
              <option value="today">Today Only</option>
              <option value="upcoming">Upcoming Only</option>
              <option value="past">Past History</option>
            </select>
          </div>

          {/* 5. Sort Dropdown */}
          <div className="filter-select-wrap">
            <select
              className="directory-filter-select sort-select"
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as 'latest' | 'oldest' | 'name' | 'amount'
                )
              }
            >
              <option value="latest">Sort: Date (Latest First)</option>
              <option value="oldest">Sort: Date (Oldest First)</option>
              <option value="name">Sort: Patient Name (A to Z)</option>
              <option value="amount">Sort: Fee (High to Low)</option>
            </select>
          </div>
        </div>

        {/* Results row at bottom of card */}
        <div className="directory-results-row">
          <span>
            Showing <strong>{filteredAppointments.length}</strong> scheduled patient booking
            {filteredAppointments.length === 1 ? '' : 's'}
            {appointments.length > filteredAppointments.length && (
              <span className="results-total-sub">
                {' '}
                ({appointments.length} total consultation{appointments.length === 1 ? '' : 's'} recorded)
              </span>
            )}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={handleResetFilters}
            >
              <IconCross />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Main View Area: Calendar View vs Table View */}
      {apptViewMode === 'calendar' ? (
        <AdminAppointmentCalendar
          appointments={calendarAppointments}
          overrides={overrides}
          onSelectPatient={onSelectPatient}
          onBookDate={(dateIso) => onQuickBook(dateIso)}
        />
      ) : (
        /* Appointments Table Card */
        <div className="admin-table-card">
          {isLoading && appointments.length === 0 ? (
            <div className="admin-loading-state">
              <div className="admin-empty-icon">
                <IconRefresh size={24} />
              </div>
              <h4>Loading Appointments...</h4>
              <p>Fetching the latest appointment records from the database.</p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="admin-empty-state">
              <div className="admin-empty-icon">
                <IconCalendar size={28} />
              </div>
              <h4>
                {stats.totalCount === 0 && !hasActiveFilters
                  ? 'No Appointments Available'
                  : 'No Appointments Match the Chosen Filter'}
              </h4>
              <p>
                {stats.totalCount === 0 && !hasActiveFilters
                  ? 'There are currently no booked appointments in the database. New patient bookings will appear here automatically.'
                  : 'No appointment records matched your current search or filter criteria. Try resetting the filters below.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={handleResetFilters}
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Mode</th>
                    <th>Patient Details</th>
                    <th>Health Concern</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map((appt) => (
                    <tr key={appt.id}>
                      <td>
                        <div className="cell-datetime">
                          <strong>{appt.date}</strong>
                          <span>{appt.time}</span>
                          {appt.location && <small className="appt-location">📍 {appt.location}</small>}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`mode-pill ${appt.consultationType === 'offline' ? 'mode-offline' : 'mode-online'
                            }`}
                        >
                          {appt.consultationType === 'offline' ? 'In-Clinic' : 'Online Meet'}
                        </span>
                      </td>
                      <td>
                        <div className="cell-patient">
                          <div className="patient-name-row">
                            <button
                              type="button"
                              className="patient-name-link"
                              onClick={() => onSelectPatient(appt)}
                            >
                              {appt.fullName}
                            </button>
                            {appt.isRepeatPatient && (
                              <button
                                type="button"
                                className="patient-repeat-count-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectPatient(appt);
                                }}
                                title="Click to view all consultations for this patient in the patient details dialog"
                              >
                                {appt.totalBookingsCount} Bookings
                              </button>
                            )}
                          </div>
                          <span className="patient-meta">
                            Age {appt.age || '—'} &bull; {appt.phone}
                          </span>
                          <span className="patient-email">{appt.email}</span>
                        </div>
                      </td>
                      <td>
                        <span className="reason-pill">{appt.reason}</span>
                        {appt.message && (
                          <p className="cell-patient-note" title={appt.message}>
                            &ldquo;{appt.message}&rdquo;
                          </p>
                        )}
                      </td>
                      <td>
                        <select
                          value={appt.status || 'confirmed'}
                          onChange={(e) =>
                            onUpdateStatus(
                              appt.id,
                              e.target.value as 'confirmed' | 'completed' | 'cancelled'
                            )
                          }
                          className={`status-dropdown status-${appt.status || 'confirmed'}`}
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td>
                        <div className="cell-payment-wrap">
                          <span className={`payment-pill pill-${appt.paymentStatus || 'paid'}`}>
                            {appt.paymentStatus === 'paid'
                              ? `${appt.paymentMethod === 'Cash' ? 'Cash Paid' : 'Paid'} ₹${appt.amount || 800
                              }`
                              : appt.paymentStatus === 'refunded'
                                ? 'Refunded'
                                : 'Pending'}
                          </span>
                          {appt.paymentStatus !== 'paid' && (
                            <button
                              type="button"
                              className="btn-mark-paid"
                              onClick={() => onUpdatePayment(appt.id, 'paid')}
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cell-actions-wrap">
                          <button
                            type="button"
                            className="action-pill action-pill-notes"
                            title="View Patient Details & Clinical Notes"
                            onClick={() => onSelectPatient(appt)}
                          >
                            <IconFileText size={13} />
                            <span>Notes</span>
                          </button>

                          {userRole !== 'receptionist' && (
                            <button
                              type="button"
                              className="action-pill action-pill-rx"
                              title="Write, print or email prescription (Doctor only)"
                              onClick={() => onPrescribe(appt)}
                            >
                              <IconPill size={13} />
                              <span>Prescription</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="action-pill action-pill-reschedule"
                            title="Reschedule appointment date & time"
                            onClick={() => onReschedule(appt)}
                          >
                            <IconCalendar size={13} />
                            <span>Reschedule</span>
                          </button>

                          {appt.consultationType !== 'offline' && appt.meetLink ? (
                            <a
                              href={appt.meetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="action-pill action-pill-meet"
                              title="Join Google Meet Video Consultation"
                            >
                              <IconVideo size={13} />
                              <span>Meet</span>
                            </a>
                          ) : (
                            <span
                              className="action-pill action-pill-clinic"
                              title="In-Clinic Visit (Akurdi Clinic)"
                            >
                              <IconBuilding size={13} />
                              <span>In-Clinic</span>
                            </span>
                          )}

                          <button
                            type="button"
                            className="action-pill action-pill-del"
                            title="Cancel / Delete Appointment"
                            onClick={() => onDeleteAppointment(appt.id, appt.fullName)}
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}