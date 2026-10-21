import { Appointment } from '@/lib/storage';
import { DoctorOverride } from '@/lib/availability';

import { Medicine } from '@/lib/medicines';

export type AdminTabType = 'overview' | 'appointments' | 'patients' | 'payments' | 'availability' | 'medicines';

export type { Medicine };

export interface AdminUser {
  email: string;
  name: string;
  role: string;
}

export interface AdminStats {
  totalCount: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  totalRevenue: number;
  pendingRevenue: number;
  uniquePatients: number;
}

export interface PatientGroup {
  fullName: string;
  phone: string;
  email: string;
  age: number;
  appointments: Appointment[];
}

export interface RevenueDailyItem {
  date: string;
  label: string;
  dayNum?: number | string;
  monthShort?: string;
  revenue: number;
  bookings: number;
  isToday?: boolean;
  isFuture?: boolean;
}

export interface RevenueMonthlyItem {
  month: string;
  monthIndex: number;
  revenue: number;
  bookings: number;
}

export interface RevenueYearlyItem {
  year: number;
  revenue: number;
  bookings: number;
}

export interface RevenueReasonBreakdown {
  reason: string;
  count: number;
  revenue: number;
}

export interface RevenuePaymentMethodBreakdown {
  method: string;
  count: number;
  amount: number;
}

export interface RevenueData {
  summary: {
    totalAllTime: number;
    todayRevenue: number;
    thisMonthRevenue: number;
    thisYearRevenue: number;
    pendingReceivables: number;
    totalPaidAppointments: number;
  };
  dailyData: RevenueDailyItem[];
  monthlyData: RevenueMonthlyItem[];
  yearlyData: RevenueYearlyItem[];
  reasonBreakdown: RevenueReasonBreakdown[];
  paymentMethodBreakdown: RevenuePaymentMethodBreakdown[];
}

