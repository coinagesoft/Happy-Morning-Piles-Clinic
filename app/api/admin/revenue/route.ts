import { NextRequest, NextResponse } from 'next/server';
import { getAllAppointments } from '@/lib/storage';
import { verifyAdminRequest } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = verifyAdminRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized access.' },
      { status: 401 }
    );
  }

  try {
    const appointments = await getAllAppointments();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);

    // Filter appointments that generated revenue (paid, not cancelled)
    const paidAppointments = appointments.filter(
      (a) => a.paymentStatus === 'paid' && a.status !== 'cancelled'
    );

    // 1. Overall Revenue KPIs
    const totalAllTime = paidAppointments.reduce((sum, a) => sum + (a.amount || 800), 0);
    const todayRevenue = paidAppointments
      .filter((a) => a.date === todayIso)
      .reduce((sum, a) => sum + (a.amount || 800), 0);

    const thisMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const thisMonthRevenue = paidAppointments
      .filter((a) => a.date.startsWith(thisMonthPrefix))
      .reduce((sum, a) => sum + (a.amount || 800), 0);

    const thisYearPrefix = `${currentYear}`;
    const thisYearRevenue = paidAppointments
      .filter((a) => a.date.startsWith(thisYearPrefix))
      .reduce((sum, a) => sum + (a.amount || 800), 0);

    const pendingReceivables = appointments
      .filter((a) => a.paymentStatus === 'pending' && a.status !== 'cancelled')
      .reduce((sum, a) => sum + (a.amount || 800), 0);

    // 2. Revenue & Bookings by Day: 15 days before, today, and 15 days onwards (31-day window)
    const dailyData: {
      date: string;
      label: string;
      dayNum: number;
      monthShort: string;
      revenue: number;
      bookings: number;
      isToday: boolean;
      isFuture: boolean;
    }[] = [];

    const kolkataDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now); // "YYYY-MM-DD"
    const [tYear, tMonth, tDay] = kolkataDateStr.split('-').map(Number);

    for (let offset = -15; offset <= 15; offset++) {
      const d = new Date(Date.UTC(tYear, tMonth - 1, tDay + offset, 12, 0, 0));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}`;

      const dayNum = d.getUTCDate();
      const monthShort = d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
      const label = `${dayNum} ${monthShort}`;

      // Appointments on this date (active, not cancelled)
      const dayAllAppts = appointments.filter((a) => a.date === iso && a.status !== 'cancelled');
      // Paid appointments on this date
      const dayPaidAppts = dayAllAppts.filter(
        (a) => a.paymentStatus === 'paid' || !a.paymentStatus
      );
      const rev = dayPaidAppts.reduce((sum, a) => sum + (a.amount || 800), 0);

      dailyData.push({
        date: iso,
        label,
        dayNum,
        monthShort,
        revenue: rev,
        bookings: dayAllAppts.length,
        isToday: iso === todayIso,
        isFuture: offset > 0,
      });
    }

    // 3. Revenue by Month (12 months of current year)
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const monthlyData: {
      month: string;
      monthIndex: number;
      revenue: number;
      bookings: number;
    }[] = monthNames.map((name, index) => {
      const monthPrefix = `${currentYear}-${String(index + 1).padStart(2, '0')}`;
      const mAppts = paidAppointments.filter((a) => a.date.startsWith(monthPrefix));
      const rev = mAppts.reduce((sum, a) => sum + (a.amount || 800), 0);
      return {
        month: name,
        monthIndex: index,
        revenue: rev,
        bookings: mAppts.length,
      };
    });

    // 4. Revenue by Year (last 3 years: currentYear - 2 to currentYear)
    const yearlyData: { year: number; revenue: number; bookings: number }[] = [];
    for (let y = currentYear - 2; y <= currentYear; y++) {
      const yAppts = paidAppointments.filter((a) => a.date.startsWith(String(y)));
      const rev = yAppts.reduce((sum, a) => sum + (a.amount || 800), 0);
      yearlyData.push({
        year: y,
        revenue: rev,
        bookings: yAppts.length,
      });
    }

    // 5. Breakdown by Consultation Reason
    const reasonMap = new Map<string, { count: number; revenue: number }>();
    appointments.forEach((a) => {
      const r = a.reason || 'General Consultation';
      const cur = reasonMap.get(r) || { count: 0, revenue: 0 };
      cur.count += 1;
      if (a.paymentStatus === 'paid' && a.status !== 'cancelled') {
        cur.revenue += a.amount || 800;
      }
      reasonMap.set(r, cur);
    });

    const reasonBreakdown = Array.from(reasonMap.entries()).map(([reason, stats]) => ({
      reason,
      count: stats.count,
      revenue: stats.revenue,
    }));

    // 6. Breakdown by Payment Method
    const methodMap = new Map<string, { count: number; amount: number }>();
    paidAppointments.forEach((a) => {
      const m = a.paymentMethod || 'UPI';
      const cur = methodMap.get(m) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += a.amount || 800;
      methodMap.set(m, cur);
    });

    const paymentMethodBreakdown = Array.from(methodMap.entries()).map(([method, stats]) => ({
      method,
      count: stats.count,
      amount: stats.amount,
    }));

    return NextResponse.json({
      summary: {
        totalAllTime,
        todayRevenue,
        thisMonthRevenue,
        thisYearRevenue,
        pendingReceivables,
        totalPaidAppointments: paidAppointments.length,
      },
      dailyData,
      monthlyData,
      yearlyData,
      reasonBreakdown,
      paymentMethodBreakdown,
    });
  } catch (err: unknown) {
    console.error('Error computing revenue analytics:', err);
    return NextResponse.json(
      { error: 'Failed to compute revenue analytics.' },
      { status: 500 }
    );
  }
}

