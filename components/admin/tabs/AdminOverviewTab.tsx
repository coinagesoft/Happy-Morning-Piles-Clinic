'use client';

import React from 'react';
import RevenueChart from '@/components/admin/RevenueChart';
import {
  IconWallet,
  IconCalendar,
  IconUsers,
  IconClock,
} from '@/components/admin/AdminIcons';
import { AdminStats, RevenueData } from '@/components/admin/types';

interface AdminOverviewTabProps {
  stats: AdminStats;
  patientCount: number;
  revenueData: RevenueData | null;
  overridesCount: number;
}

export default function AdminOverviewTab({
  stats,
  patientCount,
  revenueData,
  overridesCount,
}: AdminOverviewTabProps) {
  return (
    <div className="tab-pane-fade">
      {/* 4 Top KPI Metric Cards */}
      <div className="admin-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconWallet size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Total Revenue</span>
            <strong className="kpi-value">₹{stats.totalRevenue.toLocaleString('en-IN')}</strong>
            <span className="kpi-meta">
              Paid consultations: {stats.completedCount + stats.confirmedCount}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconCalendar size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Total Appointments</span>
            <strong className="kpi-value">{stats.totalCount}</strong>
            <span className="kpi-meta">
              {stats.confirmedCount} confirmed &bull; {stats.completedCount} completed
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconUsers size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Registered Patients</span>
            <strong className="kpi-value">{patientCount}</strong>
            <span className="kpi-meta">Unique contact profiles</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box">
            <IconClock size={22} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Pending Receivables</span>
            <strong className="kpi-value">₹{stats.pendingRevenue.toLocaleString('en-IN')}</strong>
            <span className="kpi-meta">Awaiting payment settlement</span>
          </div>
        </div>
      </div>

      {/* Interactive SVG Revenue Trends Chart */}
      {revenueData && (
        <RevenueChart
          dailyData={revenueData.dailyData}
          monthlyData={revenueData.monthlyData}
          yearlyData={revenueData.yearlyData}
        />
      )}

      {/* Two Side Breakdown Widgets */}
      <div className="overview-widgets-grid">
        {/* Consultation Reasons Breakdown */}
        <div className="admin-widget-card">
          <h3 className="widget-title">Consultations by Health Concern</h3>
          <p className="widget-subtitle">Primary concerns treated at the clinic</p>

          <div className="widget-list">
            {!revenueData?.reasonBreakdown || revenueData.reasonBreakdown.length === 0 ? (
              <div className="widget-empty-note">
                No consultations recorded yet. Health concern breakdown will appear once appointments are booked.
              </div>
            ) : (
              revenueData.reasonBreakdown.map((item) => {
                const percent = stats.totalCount > 0 ? Math.round((item.count / stats.totalCount) * 100) : 0;
                return (
                  <div key={item.reason} className="widget-breakdown-row">
                    <div className="breakdown-labels">
                      <strong>{item.reason}</strong>
                      <span>
                        {item.count} patients ({percent}%)
                      </span>
                    </div>
                    <div className="breakdown-bar-track">
                      <div
                        className="breakdown-bar-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Payment Methods & Clinic Status Breakdown */}
        <div className="admin-widget-card">
          <h3 className="widget-title">Payment Methods &amp; Status</h3>
          <p className="widget-subtitle">Breakdown of patient transactions</p>

          {!revenueData?.paymentMethodBreakdown || revenueData.paymentMethodBreakdown.length === 0 ? (
            <div className="widget-empty-note" style={{ marginBottom: '16px' }}>
              No payment transactions recorded yet.
            </div>
          ) : (
            <div className="payment-methods-grid">
              {revenueData.paymentMethodBreakdown.map((m) => (
                <div key={m.method} className="method-tile">
                  <span className="method-name">{m.method}</span>
                  <strong className="method-amt">₹{m.amount.toLocaleString('en-IN')}</strong>
                  <span className="method-count">{m.count} payments</span>
                </div>
              ))}
            </div>
          )}

          <div className="clinic-status-box">
            <h4>Doctor Schedule Highlights:</h4>
            <ul>
              <li>
                <strong>Active Leave Overrides:</strong> {overridesCount} dates configured
              </li>
              <li>
                <strong>Cancellation Rate:</strong>{' '}
                {stats.totalCount > 0
                  ? `${Math.round((stats.cancelledCount / stats.totalCount) * 100)}%`
                  : '0%'}
              </li>
              <li>
                <strong>Average Consultation Fee:</strong> ₹800
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

