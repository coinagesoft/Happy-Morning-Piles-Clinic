'use client';

import React, { useState, useMemo } from 'react';
import { Appointment } from '@/lib/storage';
import {
  IconWallet,
  IconCalendar,
  IconOverview,
  IconClock,
  IconPayments,
  IconSearch,
  IconFilter,
  IconCross,
} from '@/components/admin/AdminIcons';
import { RevenueData } from '@/components/admin/types';

interface AdminPaymentsTabProps {
  appointments: Appointment[];
  revenueData: RevenueData | null;
}

function formatPaidAt(paidAt?: string | null) {
  if (!paidAt) return '—';
  try {
    const d = new Date(paidAt);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return paidAt.slice(0, 10);
}

export default function AdminPaymentsTab({
  appointments,
  revenueData,
}: AdminPaymentsTabProps) {
  const currentYear = new Date().getFullYear();

  // Filter and Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'month' | 'year'>('all');
  const [sortBy, setSortBy] = useState<
    'newest' | 'oldest' | 'amount-high' | 'amount-low' | 'name'
  >('newest');

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    methodFilter !== 'all' ||
    statusFilter !== 'all' ||
    timeFilter !== 'all' ||
    sortBy !== 'newest';

  const handleResetFilters = () => {
    setSearchQuery('');
    setMethodFilter('all');
    setStatusFilter('all');
    setTimeFilter('all');
    setSortBy('newest');
  };

  // Filter and sort transactions
  const filteredAppointments = useMemo(() => {
    let result = [...appointments];
    const q = searchQuery.trim().toLowerCase();

    // 1. Search Query
    if (q) {
      result = result.filter((appt) => {
        const nameMatch = appt.fullName.toLowerCase().includes(q);
        const phoneMatch = appt.phone.includes(q);
        const emailMatch = appt.email.toLowerCase().includes(q);
        const idMatch = appt.id.toLowerCase().includes(q);
        const payIdMatch = appt.paymentId ? appt.paymentId.toLowerCase().includes(q) : false;
        const dateMatch = appt.date.includes(q);
        const methodMatch = appt.paymentMethod ? appt.paymentMethod.toLowerCase().includes(q) : false;
        return nameMatch || phoneMatch || emailMatch || idMatch || payIdMatch || dateMatch || methodMatch;
      });
    }

    // 2. Payment Method Filter
    if (methodFilter !== 'all') {
      result = result.filter(
        (appt) => (appt.paymentMethod || 'UPI').toLowerCase() === methodFilter.toLowerCase()
      );
    }

    // 3. Payment Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(
        (appt) => (appt.paymentStatus || 'paid').toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // 4. Timeframe Filter
    if (timeFilter !== 'all') {
      const now = new Date();
      const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
      const currentMonthPrefix = todayIso.slice(0, 7); // YYYY-MM
      const currentYearPrefix = String(now.getFullYear());

      result = result.filter((appt) => {
        const dateToCheck = appt.date;
        if (timeFilter === 'today') {
          return dateToCheck === todayIso;
        } else if (timeFilter === 'month') {
          return dateToCheck.startsWith(currentMonthPrefix);
        } else if (timeFilter === 'year') {
          return dateToCheck.startsWith(currentYearPrefix);
        }
        return true;
      });
    }

    // 5. Sorting
    result.sort((a, b) => {
      const dtA = `${a.date}T${a.time}`;
      const dtB = `${b.date}T${b.time}`;
      const amtA = a.amount || 800;
      const amtB = b.amount || 800;

      switch (sortBy) {
        case 'newest':
          return dtB.localeCompare(dtA);
        case 'oldest':
          return dtA.localeCompare(dtB);
        case 'amount-high':
          return amtB - amtA;
        case 'amount-low':
          return amtA - amtB;
        case 'name':
          return a.fullName.localeCompare(b.fullName);
        default:
          return 0;
      }
    });

    return result;
  }, [appointments, searchQuery, methodFilter, statusFilter, timeFilter, sortBy]);

  // Aggregate stats for filtered records
  const filteredTotal = useMemo(() => {
    return filteredAppointments
      .filter((a) => a.paymentStatus === 'paid' && a.status !== 'cancelled')
      .reduce((sum, a) => sum + (a.amount || 800), 0);
  }, [filteredAppointments]);

  return (
    <div className="tab-pane-fade">
      {/* 4 Financial KPI Cards */}
      <div className="admin-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconWallet size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Today&apos;s Collection</span>
            <strong className="kpi-value">
              ₹{revenueData?.summary.todayRevenue.toLocaleString('en-IN') || 0}
            </strong>
            <span className="kpi-meta">Cleared receipts today</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconCalendar size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">This Month&apos;s Collection</span>
            <strong className="kpi-value">
              ₹{revenueData?.summary.thisMonthRevenue.toLocaleString('en-IN') || 0}
            </strong>
            <span className="kpi-meta">Current month total</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconOverview size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Annual Revenue</span>
            <strong className="kpi-value">
              ₹{revenueData?.summary.thisYearRevenue.toLocaleString('en-IN') || 0}
            </strong>
            <span className="kpi-meta">Year {currentYear}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconClock size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Pending Receivables</span>
            <strong className="kpi-value">
              ₹{revenueData?.summary.pendingReceivables.toLocaleString('en-IN') || 0}
            </strong>
            <span className="kpi-meta">Awaiting payment settlement</span>
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar Card (Matches Patient Directory Design) */}
      <div className="directory-toolbar-card">
        <div className="directory-toolbar-grid payments-toolbar-grid">
          {/* 1. Live Search Input */}
          <div className="search-input-wrap">
            <span className="search-icon-box" aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="text"
              className="directory-search-input"
              placeholder="Search by patient, phone, transaction ID (e.g. CASH-..., pay_...), or date..."
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

          {/* 2. Payment Method Filter */}
          <div className="filter-select-wrap">
            <span className="filter-icon-box" aria-hidden="true">
              <IconPayments size={14} />
            </span>
            <select
              className="directory-filter-select"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="all">All Methods</option>
              <option value="Cash">Cash (In-Clinic)</option>
              <option value="Razorpay">Razorpay (Online)</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
            </select>
          </div>

          {/* 3. Payment Status Filter */}
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
              <option value="paid">Paid / Cleared</option>
              <option value="pending">Pending Settlement</option>

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
              onChange={(e) =>
                setTimeFilter(e.target.value as 'all' | 'today' | 'month' | 'year')
              }
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>

          {/* 5. Sort Dropdown */}
          <div className="filter-select-wrap">
            <select
              className="directory-filter-select sort-select"
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as
                    | 'newest'
                    | 'oldest'
                    | 'amount-high'
                    | 'amount-low'
                    | 'name'
                )
              }
            >
              <option value="newest">Sort: Date (Newest First)</option>
              <option value="oldest">Sort: Date (Oldest First)</option>
              <option value="amount-high">Sort: Amount (High to Low)</option>
              <option value="amount-low">Sort: Amount (Low to High)</option>
              <option value="name">Sort: Patient Name (A to Z)</option>
            </select>
          </div>
        </div>

        {/* Results row at bottom of card */}
        <div className="directory-results-row">
          <span>
            Showing <strong>{filteredAppointments.length}</strong> of{' '}
            <strong>{appointments.length}</strong> transactions &bull; Cleared Total:{' '}
            <strong style={{ color: '#047857' }}>₹{filteredTotal.toLocaleString('en-IN')}</strong>
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

      {/* Payments History Table */}
      <div className="admin-table-card">
        <div className="card-table-title-bar">
          <h3>Payment Transactions &amp; Receipts Log</h3>
          <span className="text-muted">
            Standard consultation fee: ₹800 per appointment
          </span>
        </div>

        {appointments.length === 0 ? (
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <IconPayments size={28} />
            </div>
            <h4>No Payment Transactions Available</h4>
            <p>
              Completed consultation payments will be logged here automatically.
            </p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="admin-empty-state">
            <div className="admin-empty-icon">
              <IconPayments size={28} />
            </div>
            <h4>No Matching Transactions Found</h4>
            <p>No transactions match your current search or filter criteria.</p>
            <button
              type="button"
              className="btn-empty-reset"
              onClick={handleResetFilters}
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Patient Name</th>
                  <th>Appointment Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Payment Status</th>
                  <th>Paid At</th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.map((appt) => (
                  <tr key={appt.id}>
                    <td>
                      <code>{appt.paymentId || `PAY-${appt.id.slice(0, 8).toUpperCase()}`}</code>
                    </td>
                    <td>
                      <strong>{appt.fullName}</strong>
                      <span className="cell-sub">{appt.phone}</span>
                    </td>
                    <td>
                      {appt.date} ({appt.time})
                    </td>
                    <td>
                      <strong>₹{appt.amount || 800}</strong>
                    </td>
                    <td>
                      <span className="method-pill">{appt.paymentMethod || 'UPI'}</span>
                    </td>
                    <td>
                      <span className={`payment-pill pill-${appt.paymentStatus || 'paid'}`}>
                        {appt.paymentStatus || 'paid'}
                      </span>
                    </td>
                    <td>
                      <span className="cell-sub">
                        {formatPaidAt(appt.paidAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
