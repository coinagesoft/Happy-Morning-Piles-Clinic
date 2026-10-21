'use client';

import React, { useState } from 'react';

interface DailyPoint {
  date: string;
  label: string;
  dayNum?: number | string;
  monthShort?: string;
  revenue: number;
  bookings: number;
  isToday?: boolean;
  isFuture?: boolean;
}

interface MonthlyPoint {
  month: string;
  monthIndex: number;
  revenue: number;
  bookings: number;
}

interface YearlyPoint {
  year: number;
  revenue: number;
  bookings: number;
}

interface RevenueChartProps {
  dailyData: DailyPoint[];
  monthlyData: MonthlyPoint[];
  yearlyData: YearlyPoint[];
}

export default function RevenueChart({
  dailyData,
  monthlyData,
  yearlyData,
}: RevenueChartProps) {
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Normalize data according to active period
  const data = React.useMemo(() => {
    if (period === 'day') {
      return dailyData.map((d) => {
        const parts = d.label.split(' ');
        const dayNum = d.dayNum !== undefined ? String(d.dayNum) : parts[0] || '';
        const monthShort = d.monthShort || parts[1] || '';
        return {
          label: d.label,
          dayNum,
          monthShort,
          value: d.revenue,
          count: d.bookings,
          subtext: d.isToday ? `${d.date} • Today` : d.isFuture ? `${d.date} • Upcoming` : d.date,
          isToday: Boolean(d.isToday),
          isFuture: Boolean(d.isFuture),
        };
      });
    } else if (period === 'month') {
      return monthlyData.map((m) => ({
        label: m.month,
        dayNum: '',
        monthShort: m.month,
        value: m.revenue,
        count: m.bookings,
        subtext: `${m.month} 2026`,
        isToday: false,
        isFuture: false,
      }));
    } else {
      return yearlyData.map((y) => ({
        label: String(y.year),
        dayNum: '',
        monthShort: String(y.year),
        value: y.revenue,
        count: y.bookings,
        subtext: `Year ${y.year}`,
        isToday: false,
        isFuture: false,
      }));
    }
  }, [period, dailyData, monthlyData, yearlyData]);

  const totalRevenue = data.reduce((sum, d) => sum + d.value, 0);
  const totalBookings = data.reduce((sum, d) => sum + d.count, 0);
  const maxValue = Math.max(...data.map((d) => d.value), 1000);

  // Chart dimensions: 980 for 31 days to give ample spacing, 640 for monthly/yearly
  const svgHeight = 230;
  const svgWidth = period === 'day' ? 980 : 640;
  const paddingBottom = 42;
  const paddingTop = 26;
  const paddingLeft = 45;
  const paddingRight = 15;

  const chartHeight = svgHeight - paddingTop - paddingBottom;
  const chartWidth = svgWidth - paddingLeft - paddingRight;

  const barWidth = Math.max(10, Math.min(32, (chartWidth / (data.length || 1)) * 0.58));
  const slotWidth = chartWidth / (data.length || 1);

  // Y-axis grid levels
  const yTicks = [
    0,
    Math.round(maxValue * 0.33),
    Math.round(maxValue * 0.66),
    maxValue,
  ];

  return (
    <div className="admin-chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Revenue Trends</h3>
          <p className="chart-subtitle">
            Consultation fee collections ({period === 'day' ? '15 Days Past & 15 Days Onwards' : period === 'month' ? 'Current Year by Month' : 'Annual Growth'})
          </p>
        </div>

        <div className="chart-header-actions">
          {period === 'day' && (
            <div className="chart-legend-row" aria-hidden="true">
              <span className="legend-item">
                <span className="legend-dot dot-past"></span> Past (15 Days)
              </span>
              <span className="legend-item">
                <span className="legend-dot dot-today"></span> Today
              </span>
              <span className="legend-item">
                <span className="legend-dot dot-future"></span> Tomorrow Onwards
              </span>
            </div>
          )}

          <div className="chart-period-tabs">
            <button
              type="button"
              className={`period-tab-btn ${period === 'day' ? 'active' : ''}`}
              onClick={() => {
                setPeriod('day');
                setHoveredIndex(null);
              }}
            >
              By Day
            </button>
            <button
              type="button"
              className={`period-tab-btn ${period === 'month' ? 'active' : ''}`}
              onClick={() => {
                setPeriod('month');
                setHoveredIndex(null);
              }}
            >
              By Month
            </button>
            <button
              type="button"
              className={`period-tab-btn ${period === 'year' ? 'active' : ''}`}
              onClick={() => {
                setPeriod('year');
                setHoveredIndex(null);
              }}
            >
              By Year
            </button>
          </div>
        </div>
      </div>

      <div className="chart-stats-ribbon">
        <div className="ribbon-metric">
          <span className="ribbon-label">Period Collections</span>
          <strong className="ribbon-val">₹{totalRevenue.toLocaleString('en-IN')}</strong>
        </div>
        <div className="ribbon-metric">
          <span className="ribbon-label">Consultations</span>
          <strong className="ribbon-val">{totalBookings} visits</strong>
        </div>
        <div className="ribbon-metric">
          <span className="ribbon-label">Avg. per Visit</span>
          <strong className="ribbon-val">
            ₹{totalBookings ? Math.round(totalRevenue / totalBookings) : 0}
          </strong>
        </div>
        {hoveredIndex !== null && data[hoveredIndex] && (
          <div className="ribbon-active-hover">
            <span>
              <strong>{data[hoveredIndex].subtext}:</strong> ₹
              {data[hoveredIndex].value.toLocaleString('en-IN')} ({data[hoveredIndex].count} {data[hoveredIndex].count === 1 ? 'visit' : 'visits'})
            </span>
          </div>
        )}
      </div>

      {/* Responsive SVG Chart */}
      <div className="chart-svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="admin-revenue-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Standard / Past Bar Gradient */}
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#565ACF" />
              <stop offset="100%" stopColor="#8589F5" stopOpacity="0.85" />
            </linearGradient>

            {/* Active / Hover Bar Gradient */}
            <linearGradient id="activeBarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F17732" />
              <stop offset="100%" stopColor="#FF975C" />
            </linearGradient>

            {/* Today Bar Gradient */}
            <linearGradient id="todayBarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F17732" />
              <stop offset="100%" stopColor="#FFA066" stopOpacity="0.9" />
            </linearGradient>

            {/* Tomorrow Onwards / Future Gradient */}
            <linearGradient id="futureBarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0EA5E9" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* Y-axis gridlines */}
          {yTicks.map((tick, i) => {
            const yPos = paddingTop + chartHeight - (tick / maxValue) * chartHeight;
            return (
              <g key={`ytick-${i}`} className="chart-gridline-group">
                <line
                  x1={paddingLeft}
                  y1={yPos}
                  x2={svgWidth - paddingRight}
                  y2={yPos}
                  stroke="#e2e8f0"
                  strokeDasharray={i === 0 ? 'none' : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#94a3b8"
                  fontFamily="var(--sans)"
                >
                  ₹{tick >= 1000 ? `${Math.round(tick / 1000)}k` : tick}
                </text>
              </g>
            );
          })}

          {/* Data Bars */}
          {data.map((item, index) => {
            const barHeight = maxValue > 0 ? (item.value / maxValue) * chartHeight : 0;
            const xCenter = paddingLeft + index * slotWidth + slotWidth / 2;
            const xPos = xCenter - barWidth / 2;
            const yPos = paddingTop + chartHeight - barHeight;
            const isHovered = hoveredIndex === index;

            return (
              <g
                key={`bar-${index}`}
                className="chart-bar-group"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Background hover highlight column */}
                <rect
                  x={paddingLeft + index * slotWidth}
                  y={paddingTop}
                  width={slotWidth}
                  height={chartHeight}
                  fill={isHovered ? 'rgba(99, 184, 216, 0.08)' : 'transparent'}
                  rx="3"
                />

                {/* Actual Bar */}
                <rect
                  x={xPos}
                  y={item.value > 0 ? yPos : paddingTop + chartHeight - 3}
                  width={barWidth}
                  height={item.value > 0 ? Math.max(barHeight, 4) : 3}
                  rx="3"
                  fill={
                    isHovered
                      ? 'url(#activeBarGradient)'
                      : item.value > 0
                      ? item.isToday
                        ? 'url(#todayBarGradient)'
                        : item.isFuture
                        ? 'url(#futureBarGradient)'
                        : 'url(#barGradient)'
                      : item.isToday
                      ? '#fed7aa'
                      : item.isFuture
                      ? '#e0f2fe'
                      : '#e2e8f0'
                  }
                  className="chart-bar-rect"
                />

                {/* Bar Value on top on hover */}
                {isHovered && (
                  <text
                    x={xCenter}
                    y={Math.max(yPos - 6, 14)}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight="700"
                    fill={item.isToday ? '#EA580C' : item.isFuture ? '#0284c7' : 'var(--primary)'}
                  >
                    ₹{item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value}
                  </text>
                )}

                {/* X-axis label */}
                {period === 'day' ? (
                  <g>
                    {/* Today background highlight pill */}
                    {item.isToday && (
                      <rect
                        x={xCenter - 14}
                        y={svgHeight - 38}
                        width={28}
                        height={34}
                        rx={6}
                        fill="#F17732"
                        opacity="0.14"
                      />
                    )}
                    <text
                      x={xCenter}
                      y={svgHeight - 24}
                      textAnchor="middle"
                      fontSize="11"
                      fill={
                        item.isToday
                          ? '#EA580C'
                          : isHovered
                          ? 'var(--primary)'
                          : item.isFuture
                          ? '#0284c7'
                          : '#334155'
                      }
                      fontWeight={item.isToday ? '800' : isHovered ? '700' : '600'}
                    >
                      {item.dayNum}
                    </text>
                    <text
                      x={xCenter}
                      y={svgHeight - 11}
                      textAnchor="middle"
                      fontSize="9"
                      fill={
                        item.isToday
                          ? '#EA580C'
                          : isHovered
                          ? 'var(--primary)'
                          : '#94a3b8'
                      }
                      fontWeight={item.isToday ? '700' : '500'}
                    >
                      {item.isToday ? 'Today' : item.monthShort}
                    </text>
                  </g>
                ) : (
                  <text
                    x={xCenter}
                    y={svgHeight - 14}
                    textAnchor="middle"
                    fontSize="11"
                    fill={isHovered ? 'var(--primary)' : 'var(--muted)'}
                    fontWeight={isHovered ? '700' : '500'}
                  >
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
