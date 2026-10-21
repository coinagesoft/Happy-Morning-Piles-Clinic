'use client';

import React, { useState, useMemo } from 'react';
import {
  IconUsers,
  IconArrowRight,
  IconSearch,
  IconFilter,
  IconCross,
  IconPhone,
  IconMail,
  IconCalendar,
  IconTable,
  IconGrid,
  IconFileText,
} from '@/components/admin/AdminIcons';
import { PatientGroup } from '@/components/admin/types';

interface AdminPatientsTabProps {
  patients: PatientGroup[];
  onSelectPatient: (patient: PatientGroup) => void;
}

function formatReadableDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

export default function AdminPatientsTab({
  patients,
  onSelectPatient,
}: AdminPatientsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | 'repeat' | 'first'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'month' | '30days' | 'year'>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'visits' | 'spend' | 'name'>('latest');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    frequencyFilter !== 'all' ||
    timeFilter !== 'all' ||
    sortBy !== 'latest';

  const handleResetFilters = () => {
    setSearchQuery('');
    setFrequencyFilter('all');
    setTimeFilter('all');
    setSortBy('latest');
  };

  // Filter and sort patients
  const filteredPatients = useMemo(() => {
    let result = [...patients];
    const q = searchQuery.trim().toLowerCase();

    // 1. Search Query Filter (Name, Phone, Email, Date, Health Concern, Payment ID)
    if (q) {
      result = result.filter((p) => {
        const nameMatch = p.fullName.toLowerCase().includes(q);
        const phoneMatch = p.phone.includes(q);
        const emailMatch = p.email.toLowerCase().includes(q);
        const dateMatch = p.appointments.some((a) => a.date.includes(q));
        const reasonMatch = p.appointments.some((a) =>
          a.reason.toLowerCase().includes(q)
        );
        const paymentMatch = p.appointments.some(
          (a) => a.paymentId && a.paymentId.toLowerCase().includes(q)
        );
        return nameMatch || phoneMatch || emailMatch || dateMatch || reasonMatch || paymentMatch;
      });
    }

    // 2. Visit Frequency Filter
    if (frequencyFilter === 'repeat') {
      result = result.filter((p) => p.appointments.length > 1);
    } else if (frequencyFilter === 'first') {
      result = result.filter((p) => p.appointments.length === 1);
    }

    // 3. Time Filter
    if (timeFilter !== 'all') {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthStr = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      result = result.filter((p) => {
        if (timeFilter === 'month') {
          return p.appointments.some((a) => a.date.startsWith(currentMonthStr));
        } else if (timeFilter === '30days') {
          return p.appointments.some((a) => a.date >= thirtyDaysAgo);
        } else if (timeFilter === 'year') {
          return p.appointments.some((a) => a.date.startsWith(String(currentYear)));
        }
        return true;
      });
    }

    // 4. Sorting
    result.sort((a, b) => {
      const aLatestDate = a.appointments[0]?.date || '';
      const bLatestDate = b.appointments[0]?.date || '';

      const aTotalSpent = a.appointments
        .filter((apt) => apt.paymentStatus === 'paid' && apt.status !== 'cancelled')
        .reduce((sum, apt) => sum + (apt.amount || 800), 0);
      const bTotalSpent = b.appointments
        .filter((apt) => apt.paymentStatus === 'paid' && apt.status !== 'cancelled')
        .reduce((sum, apt) => sum + (apt.amount || 800), 0);

      switch (sortBy) {
        case 'latest':
          return bLatestDate.localeCompare(aLatestDate);
        case 'oldest':
          return aLatestDate.localeCompare(bLatestDate);
        case 'visits':
          return b.appointments.length - a.appointments.length;
        case 'spend':
          return bTotalSpent - aTotalSpent;
        case 'name':
          return a.fullName.localeCompare(b.fullName);
        default:
          return 0;
      }
    });

    return result;
  }, [patients, searchQuery, frequencyFilter, timeFilter, sortBy]);

  return (
    <div className="tab-pane-fade">
      {/* Directory Page Heading */}
      <div className="directory-header-row">
        <div>
          <h3 className="section-title">Patient Directory &amp; Clinical Records</h3>
          <p className="section-subtitle">
            Manage comprehensive clinical consultation history, digital prescriptions, and patient records.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="view-mode-toggle" role="group" aria-label="Switch view mode">
          <button
            type="button"
            className={`btn-view-toggle ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Tabular View (Recommended)"
          >
            <IconTable size={15} />
            <span>Table</span>
          </button>
          <button
            type="button"
            className={`btn-view-toggle ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Grid Cards View"
          >
            <IconGrid size={15} />
            <span>Cards</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Toolbar Card */}
      <div className="directory-toolbar-card">
        <div className="directory-toolbar-grid">
          {/* 1. Live Search Input */}
          <div className="search-input-wrap">
            <span className="search-icon-box" aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="text"
              className="directory-search-input"
              placeholder="Search by name, phone, email, date (e.g. 2026-10-15), or health concern..."
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

          {/* 2. Frequency Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconFilter size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={frequencyFilter}
              onChange={(e) =>
                setFrequencyFilter(e.target.value as 'all' | 'repeat' | 'first')
              }
            >
              <option value="all">All Patients ({patients.length})</option>
              <option value="repeat">Repeat Patients (2+ visits)</option>
              <option value="first">New Patients (1st visit)</option>
            </select>
          </div>

          {/* 3. Activity / Time Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconCalendar size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={timeFilter}
              onChange={(e) =>
                setTimeFilter(e.target.value as 'all' | 'month' | '30days' | 'year')
              }
            >
              <option value="all">All Time History</option>
              <option value="month">Visited This Month</option>
              <option value="30days">Visited Last 30 Days</option>
              <option value="year">Visited This Year</option>
            </select>
          </div>

          {/* 4. Sort Order */}
          <div className="filter-select-wrap">
            <select
              className="directory-filter-select sort-select"
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as 'latest' | 'oldest' | 'visits' | 'spend' | 'name'
                )
              }
            >
              <option value="latest">Sort: Latest Visit First</option>
              <option value="oldest">Sort: Oldest Visit First</option>
              <option value="visits">Sort: Most Consultations</option>
              <option value="spend">Sort: Highest Lifetime Spend</option>
              <option value="name">Sort: Name (A to Z)</option>
            </select>
          </div>
        </div>

        {/* Results Counter & Reset Action */}
        <div className="directory-results-row">
          <div className="results-count-text">
            Showing <strong>{filteredPatients.length}</strong> of{' '}
            <strong>{patients.length}</strong> registered patient
            {patients.length === 1 ? '' : 's'}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={handleResetFilters}
            >
              <IconCross />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Patient Directory Content */}
      {patients.length === 0 ? (
        /* Empty State: Zero registered patients */
        <div className="admin-table-card">
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <IconUsers size={28} />
            </div>
            <h4>No Registered Patients Yet</h4>
            <p>
              Patient profiles are automatically generated and linked by phone/email as soon as appointments are booked.
            </p>
          </div>
        </div>
      ) : filteredPatients.length === 0 ? (
        /* Empty State: Search filter returned no results */
        <div className="admin-table-card">
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <IconSearch size={28} />
            </div>
            <h4>No Matching Patients Found</h4>
            <p>
              No patient records match your current search &quot;{searchQuery}&quot; or selected filters.
            </p>
            <button
              type="button"
              className="btn-empty-reset"
              onClick={handleResetFilters}
            >
              Clear Search &amp; Show All Patients
            </button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* 1. Tabular View (Default) */
        <div className="admin-table-card">
          <div className="table-responsive">
            <table className="admin-table patients-directory-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '220px' }}>Patient</th>
                  <th style={{ minWidth: '220px' }}>Contact Details</th>
                  <th style={{ minWidth: '140px' }}>Consultations</th>
                  <th style={{ minWidth: '220px' }}>Latest Consultation</th>
                  <th style={{ minWidth: '130px' }}>Lifetime Spend</th>
                  <th style={{ minWidth: '150px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => {
                  const totalSpent = patient.appointments
                    .filter((a) => a.paymentStatus === 'paid' && a.status !== 'cancelled')
                    .reduce((sum, a) => sum + (a.amount || 800), 0);

                  const latestAppt = patient.appointments[0];
                  const firstAppt = patient.appointments[patient.appointments.length - 1];

                  return (
                    <tr
                      key={patient.email || patient.phone}
                      className="patient-table-row"
                      onClick={() => onSelectPatient(patient)}
                      title="Click row to open patient history & clinical notes drawer"
                    >
                      {/* Patient Avatar & Name */}
                      <td>
                        <div className="patient-cell-profile">
                          <div className="patient-avatar-circle small-avatar">
                            {patient.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="patient-profile-info">
                            <strong className="patient-name-link">
                              {patient.fullName}
                            </strong>
                            <div className="patient-meta-row">
                              <span className="patient-age-badge">
                                {patient.age ? `Age ${patient.age}` : 'Age —'}
                              </span>
                              {patient.appointments.length > 1 && (
                                <span className="patient-repeat-badge">Repeat</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Info */}
                      <td>
                        <div className="patient-cell-contact">
                          <div className="contact-item">
                            <IconPhone size={12} />
                            <span>{patient.phone}</span>
                          </div>
                          <div className="contact-item email-item" title={patient.email}>
                            <IconMail size={12} />
                            <span className="truncate-text">{patient.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Total Consultations */}
                      <td>
                        <div className="patient-cell-visits">
                          <span className="visits-count-pill">
                            {patient.appointments.length} Visit
                            {patient.appointments.length === 1 ? '' : 's'}
                          </span>
                          <span className="first-visit-date">
                            Since {formatReadableDate(firstAppt?.date)}
                          </span>
                        </div>
                      </td>

                      {/* Latest Consultation Details */}
                      <td>
                        {latestAppt ? (
                          <div className="patient-cell-latest">
                            <div className="latest-datetime">
                              <strong>{formatReadableDate(latestAppt.date)}</strong>
                              <span className="latest-time">{latestAppt.time}</span>
                            </div>
                            <span className="latest-reason-chip" title={latestAppt.reason}>
                              {latestAppt.reason}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {/* Lifetime Spend */}
                      <td>
                        <div className="patient-cell-financial">
                          <strong className="spend-amount">
                            ₹{totalSpent.toLocaleString('en-IN')}
                          </strong>
                          <span className="paid-count-label">
                            {
                              patient.appointments.filter(
                                (a) => a.paymentStatus === 'paid' && a.status !== 'cancelled'
                              ).length
                            }{' '}
                            paid sessions
                          </span>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-table-history"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPatient(patient);
                          }}
                          title="Open patient details and consultation history drawer"
                        >
                          <IconFileText size={13} />
                          <span>View Records</span>
                          <IconArrowRight />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 2. Grid Cards View (Alternative View Mode) */
        <div className="patients-grid">
          {filteredPatients.map((patient) => {
            const totalSpent = patient.appointments
              .filter((a) => a.paymentStatus === 'paid' && a.status !== 'cancelled')
              .reduce((sum, a) => sum + (a.amount || 800), 0);

            const latestAppt = patient.appointments[0];

            return (
              <div
                key={patient.email || patient.phone}
                className="patient-card"
                onClick={() => onSelectPatient(patient)}
              >
                <div className="patient-card-header">
                  <div className="patient-avatar-circle">
                    {patient.fullName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="patient-header-details">
                    <h4 className="patient-card-name">{patient.fullName}</h4>
                    <span className="patient-card-age">Age: {patient.age || '—'}</span>
                  </div>
                </div>

                <div className="patient-card-body">
                  <div className="card-detail-item">
                    <span>Phone:</span>
                    <strong>{patient.phone}</strong>
                  </div>
                  <div className="card-detail-item">
                    <span>Email:</span>
                    <strong className="truncate-text">{patient.email}</strong>
                  </div>
                  <div className="card-detail-item">
                    <span>Total Consultations:</span>
                    <strong className="visits-highlight">
                      {patient.appointments.length} Visits
                    </strong>
                  </div>
                  <div className="card-detail-item">
                    <span>Lifetime Spend:</span>
                    <strong className="highlight-green">
                      ₹{totalSpent.toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div className="card-detail-item">
                    <span>Latest Visit:</span>
                    <span>{formatReadableDate(latestAppt?.date)}</span>
                  </div>
                </div>

                <div className="patient-card-footer">
                  <button
                    type="button"
                    className="btn-view-history"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPatient(patient);
                    }}
                  >
                    <IconFileText size={13} />
                    <span>View Records &amp; Rx Notes</span>
                    <IconArrowRight />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
