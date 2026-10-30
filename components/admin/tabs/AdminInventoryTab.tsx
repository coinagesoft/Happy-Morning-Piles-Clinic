'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from '@/components/ui/Toast';
import {
  IconPlus,
  IconRefresh,
  IconCross,
  IconEdit,
  IconTrash,
  IconSearch,
  IconDownload,
  IconBuilding,
  IconFileText,
  IconWallet,
  IconMedicineBottle,
  IconOverview,
} from '@/components/admin/AdminIcons';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type Supplier,
  type StockItem,
  type StockMovement,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type Invoice,
  type Expense,
  type InventorySummary,
} from '@/lib/inventoryConstants';

interface Props {
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  userRole?: string;
}

type View = 'overview' | 'stock' | 'orders' | 'invoices' | 'expenses' | 'suppliers';

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
};

const TONES: Record<string, { bg: string; fg: string }> = {
  green: { bg: '#ECFDF5', fg: '#047857' },
  amber: { bg: '#FFFBEB', fg: '#B45309' },
  red: { bg: '#FEF2F2', fg: '#B91C1C' },
  blue: { bg: '#EFF6FF', fg: '#1D4ED8' },
  grey: { bg: '#F1F5F9', fg: '#475569' },
};
function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span style={{ background: t.bg, color: t.fg, padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
const poTone = (s: string): keyof typeof TONES =>
  ({ draft: 'grey', ordered: 'blue', partial: 'amber', received: 'green', cancelled: 'red' } as const)[s as 'draft'] || 'grey';
const payTone = (s: string): keyof typeof TONES => (s === 'paid' ? 'green' : s === 'partial' ? 'amber' : 'red');

function Drawer({ title, subtitle, onClose, width = 640, children }: { title: string; subtitle?: string; onClose: () => void; width?: number; children: React.ReactNode }) {
  return (
    <div className="admin-drawer-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <aside className="admin-drawer-panel" style={{ width: `min(${width}px, 100vw)` }} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-header">
          <div className="drawer-title-wrap">
            <div>
              <h3>{title}</h3>
              {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="btn-drawer-close" onClick={onClose} aria-label="Close">
            <IconCross />
          </button>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', padding: 22, gap: 16 }}>{children}</div>
      </aside>
    </div>
  );
}

function FormFooter({ onCancel, busy, label, extra }: { onCancel: () => void; busy: boolean; label: string; extra?: React.ReactNode }) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" className="rx-btn rx-btn-ghost" onClick={onCancel}>Cancel</button>
      {extra}
      <button type="submit" className="rx-btn rx-btn-primary" disabled={busy}>{busy ? 'Saving...' : label}</button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="admin-empty-state">
      <h4>Nothing here yet</h4>
      <p>{text}</p>
    </div>
  );
}

export default function AdminInventoryTab({ adminFetch }: Props) {
  const [view, setView] = useState<View>('overview');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [month, setMonth] = useState(today().slice(0, 7));

  const [supplierForm, setSupplierForm] = useState<Partial<Supplier> | null>(null);
  const [poForm, setPoForm] = useState<PoFormState | null>(null);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState | null>(null);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [expenseForm, setExpenseForm] = useState<Partial<Expense> | null>(null);
  const [stockItem, setStockItem] = useState<StockItem | null>(null);

  const call = useCallback(
    async (method: string, resource: string, body?: unknown, query = '') => {
      const res = await adminFetch(`/api/admin/inventory/${resource}${query}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed.');
      return data;
    },
    [adminFetch]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st, su, po, inv, ex] = await Promise.all([
        call('GET', 'summary', undefined, `?month=${month}`),
        call('GET', 'stock'),
        call('GET', 'suppliers'),
        call('GET', 'purchase-orders'),
        call('GET', 'invoices'),
        call('GET', 'expenses'),
      ]);
      setSummary(s.summary);
      setStock(st.stock);
      setSuppliers(su.suppliers);
      setOrders(po.purchaseOrders);
      setInvoices(inv.invoices);
      setExpenses(ex.expenses);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load inventory data.');
    } finally {
      setLoading(false);
    }
  }, [call, month]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setSearch('');
    setStatusFilter('all');
  }, [view]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await reload();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    }
  };

  const q = search.trim().toLowerCase();
  const match = (...vals: string[]) => !q || vals.some((v) => (v || '').toLowerCase().includes(q));

  const fStock = useMemo(
    () => stock.filter((s) => match(s.name, s.category, s.form) && (statusFilter === 'all' || (statusFilter === 'low' ? s.isLow : !s.isLow))),
    [stock, q, statusFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fOrders = useMemo(
    () => orders.filter((o) => match(o.poNumber, o.supplierName) && (statusFilter === 'all' || o.status === statusFilter)),
    [orders, q, statusFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fInvoices = useMemo(
    () =>
      invoices.filter(
        (i) =>
          match(i.invoiceNumber, i.supplierName, i.poNumber) &&
          (statusFilter === 'all' || (statusFilter === 'overdue' ? i.isOverdue : i.paymentStatus === statusFilter))
      ),
    [invoices, q, statusFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fExpenses = useMemo(
    () => expenses.filter((e) => match(e.description, e.vendor, e.category) && (statusFilter === 'all' || e.category === statusFilter)),
    [expenses, q, statusFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fSuppliers = useMemo(() => suppliers.filter((s) => match(s.name, s.phone, s.gstin, s.contactPerson)), [suppliers, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportSheet = (rows: Record<string, unknown>[], name: string) => {
    if (!rows.length) return toast.warning('Nothing to export.');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name);
    XLSX.writeFile(wb, `Happy_Morning_${name}_${today()}.xlsx`);
  };

  const openNewPo = (preset?: { medicine?: StockItem }) =>
    setPoForm({
      supplierId: '',
      orderDate: today(),
      expectedDate: '',
      notes: '',
      items: [
        preset?.medicine
          ? { medicineId: preset.medicine.id, medicineName: preset.medicine.name, potency: preset.medicine.potency, form: preset.medicine.form, quantity: Math.max(1, preset.medicine.reorderLevel * 2 - preset.medicine.stockQty), unitCost: preset.medicine.unitCost, taxPercent: 12 }
          : blankItem(),
      ],
    });

  const lowStock = stock.filter((s) => s.isLow);

  /* ───────────── rendering ───────────── */

  const tabs: Array<{ id: View; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'stock', label: 'Stock', count: lowStock.length || undefined },
    { id: 'orders', label: 'Purchase Orders', count: orders.filter((o) => ['draft', 'ordered', 'partial'].includes(o.status)).length || undefined },
    { id: 'invoices', label: 'Invoices / Bills', count: invoices.filter((i) => i.paymentStatus !== 'paid').length || undefined },
    { id: 'expenses', label: 'Expenses' },
    { id: 'suppliers', label: 'Suppliers' },
  ];

  const primaryAction: Record<View, { label: string; onClick: () => void } | null> = {
    overview: null,
    stock: { label: 'Create PO for low stock', onClick: () => openNewPo({ medicine: lowStock[0] }) },
    orders: { label: 'New Purchase Order', onClick: () => openNewPo() },
    invoices: { label: 'Add Supplier Bill', onClick: () => setInvoiceForm(blankInvoice()) },
    expenses: { label: 'Add Expense', onClick: () => setExpenseForm({ expenseDate: today(), category: EXPENSE_CATEGORIES[0], paymentMethod: 'Cash' }) },
    suppliers: { label: 'Add Supplier', onClick: () => setSupplierForm({}) },
  };
  const action = primaryAction[view];
  const showAction = action && !(view === 'stock' && !lowStock.length);

  return (
    <div className="tab-pane-fade">
      <div className="directory-header-row">
        <div>
          <h3 className="section-title">Inventory, Purchases &amp; Expenses</h3>
          <p className="section-subtitle">
            Track medicine stock, raise purchase orders, record supplier bills and payments, and keep clinic expenses in one place.
          </p>
        </div>
        <div className="appt-header-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          {showAction && (
            <button type="button" className="btn-admin-primary" onClick={action!.onClick}>
              <IconPlus />
              <span>{action!.label}</span>
            </button>
          )}
          <button type="button" className="btn-reload" onClick={reload} title="Refresh">
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="rx-chips" style={{ margin: '4px 0 14px', flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`rx-chip ${view === t.id ? 'on' : ''}`} onClick={() => setView(t.id)}>
            {t.label}
            {t.count ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {view !== 'overview' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <span style={{ position: 'absolute', left: 10, top: 10, color: '#94A3B8' }}><IconSearch size={15} /></span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="rx-input" style={{ paddingLeft: 32 }}
            />
          </div>
          {view !== 'suppliers' && (
            <select className="directory-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              {view === 'stock' && (<><option value="low">Low / out of stock</option><option value="ok">In stock</option></>)}
              {view === 'orders' && ['draft', 'ordered', 'partial', 'received', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
              {view === 'invoices' && (<><option value="unpaid">Unpaid</option><option value="partial">Partly paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option></>)}
              {view === 'expenses' && EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {view === 'stock' && <button type="button" className="btn-reload" onClick={() => exportSheet(fStock.map((s) => ({ Medicine: s.name, Potency: s.potency, Form: s.form, Category: s.category, Stock: s.stockQty, 'Reorder level': s.reorderLevel, 'Unit cost': s.unitCost, 'Stock value': s.stockValue })), 'Stock')}><IconDownload size={14} /><span>Export</span></button>}
          {view === 'invoices' && <button type="button" className="btn-reload" onClick={() => exportSheet(fInvoices.map((i) => ({ Invoice: i.invoiceNumber, Supplier: i.supplierName, PO: i.poNumber, Date: i.invoiceDate, Due: i.dueDate, Total: i.total, Paid: i.amountPaid, Balance: i.balance, Status: i.paymentStatus })), 'Invoices')}><IconDownload size={14} /><span>Export</span></button>}
          {view === 'expenses' && <button type="button" className="btn-reload" onClick={() => exportSheet(fExpenses.map((e) => ({ Date: e.expenseDate, Category: e.category, Description: e.description, Vendor: e.vendor, Amount: e.amount, Method: e.paymentMethod, Reference: e.reference })), 'Expenses')}><IconDownload size={14} /><span>Export</span></button>}
        </div>
      )}

      {/* ───── Overview ───── */}
      {view === 'overview' && summary && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Month</label>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rx-input" style={{ width: 170 }} />
          </div>
          <div className="admin-kpi-grid">
            <Kpi icon={<IconFileText size={22} />} label="Purchases (billed)" value={inr(summary.purchasesThisMonth)} meta="Supplier bills this month" />
            <Kpi icon={<IconWallet size={22} />} label="Total spend (cash out)" value={inr(summary.totalSpendThisMonth)} meta={`Bill payments ${inr(summary.paidThisMonth)} + expenses ${inr(summary.expensesThisMonth)}`} />
            <Kpi icon={<IconBuilding size={22} />} label="Payables outstanding" value={inr(summary.outstandingPayables)} meta={summary.overdueCount ? `${summary.overdueCount} overdue bill(s)` : 'No overdue bills'} />
            <Kpi icon={<IconMedicineBottle size={22} />} label="Stock value" value={inr(summary.stockValue)} meta={`${summary.lowStockCount} low-stock item(s) · ${summary.openPoCount} open PO(s)`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
            <div className="admin-table-card" style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 12px' }}>Last 6 months</h4>
              <TrendBars data={summary.trend} />
            </div>
            <div className="admin-table-card" style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 12px' }}>Expenses by category (this month)</h4>
              {summary.expenseByCategory.length === 0 ? (
                <p style={{ color: '#94A3B8', fontSize: 13 }}>No expenses recorded this month.</p>
              ) : (
                summary.expenseByCategory.map((c) => (
                  <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13.5 }}>
                    <span>{c.category}</span>
                    <strong>{inr(c.amount)}</strong>
                  </div>
                ))
              )}
            </div>
            <div className="admin-table-card" style={{ padding: 18 }}>
              <h4 style={{ margin: '0 0 12px' }}>Needs attention</h4>
              {lowStock.slice(0, 6).map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13.5 }}>
                  <span>{s.name} {s.potency && <small style={{ color: '#94A3B8' }}>{s.potency}</small>}</span>
                  <Badge tone={s.stockQty === 0 ? 'red' : 'amber'}>{s.stockQty === 0 ? 'Out of stock' : `${s.stockQty} left`}</Badge>
                </div>
              ))}
              {invoices.filter((i) => i.isOverdue).slice(0, 4).map((i) => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13.5 }}>
                  <span>Bill {i.invoiceNumber} · {i.supplierName || 'Supplier'}</span>
                  <Badge tone="red">Overdue {inr(i.balance)}</Badge>
                </div>
              ))}
              {!lowStock.length && !invoices.some((i) => i.isOverdue) && <p style={{ color: '#94A3B8', fontSize: 13 }}>All good — no low stock or overdue bills.</p>}
            </div>
          </div>
        </>
      )}

      {/* ───── Stock ───── */}
      {view === 'stock' && (
        <div className="admin-table-card">
          {fStock.length === 0 ? <Empty text="No medicines match. Add medicines from the Medicine List first." /> : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead><tr><th>Medicine</th><th>Form / Potency</th><th>Category</th><th style={{ textAlign: 'right' }}>In stock</th><th style={{ textAlign: 'right' }}>Reorder at</th><th style={{ textAlign: 'right' }}>Unit cost</th><th style={{ textAlign: 'right' }}>Value</th><th>Actions</th></tr></thead>
                <tbody>
                  {fStock.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.form}{s.potency ? ` · ${s.potency}` : ''}</td>
                      <td>{s.category}</td>
                      <td style={{ textAlign: 'right' }}>{s.stockQty} {s.stockQty === 0 ? <Badge tone="red">Out</Badge> : s.isLow ? <Badge tone="amber">Low</Badge> : null}</td>
                      <td style={{ textAlign: 'right' }}>{s.reorderLevel}</td>
                      <td style={{ textAlign: 'right' }}>{inr(s.unitCost)}</td>
                      <td style={{ textAlign: 'right' }}>{inr(s.stockValue)}</td>
                      <td>
                        <button type="button" className="btn-reload" onClick={() => setStockItem(s)}><IconEdit size={14} /><span>Adjust</span></button>{' '}
                        {s.isLow && <button type="button" className="btn-reload" onClick={() => openNewPo({ medicine: s })}>Reorder</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───── Purchase Orders ───── */}
      {view === 'orders' && (
        <div className="admin-table-card">
          {fOrders.length === 0 ? <Empty text="Create a purchase order to order medicines from a supplier." /> : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead><tr><th>PO No.</th><th>Date</th><th>Supplier</th><th>Items</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {fOrders.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.poNumber}</strong></td>
                      <td>{fmtDate(o.orderDate)}</td>
                      <td>{o.supplierName || '—'}</td>
                      <td>{o.itemCount}</td>
                      <td style={{ textAlign: 'right' }}>{inr(o.total)}</td>
                      <td><Badge tone={poTone(o.status)}>{o.status}</Badge></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(o.status === 'draft' || o.status === 'ordered') && (
                          <button type="button" className="btn-reload" onClick={async () => { const d = await call('GET', 'purchase-orders', undefined, `?id=${o.id}`); setPoForm(poToForm(d.purchaseOrder)); }}><IconEdit size={14} /><span>Edit</span></button>
                        )}{' '}
                        {o.status === 'draft' && <button type="button" className="btn-reload" onClick={() => run(() => call('POST', 'purchase-orders', { action: 'status', id: o.id, status: 'ordered' }), 'Marked as ordered.')}>Mark ordered</button>}
                        {(o.status === 'ordered' || o.status === 'partial') && <button type="button" className="btn-reload" style={{ background: '#ECFDF5', color: '#047857', borderColor: '#A7F3D0' }} onClick={async () => { const d = await call('GET', 'purchase-orders', undefined, `?id=${o.id}`); setReceivePo(d.purchaseOrder); }}>Receive stock</button>}{' '}
                        {o.status !== 'received' && o.status !== 'partial' && o.status !== 'cancelled' && <button type="button" className="btn-reload" onClick={() => run(() => call('POST', 'purchase-orders', { action: 'status', id: o.id, status: 'cancelled' }), 'Purchase order cancelled.')}>Cancel</button>}{' '}
                        <button type="button" className="btn-reload" onClick={async () => { const d = await call('GET', 'purchase-orders', undefined, `?id=${o.id}`); printPo(d.purchaseOrder, suppliers.find((s) => s.id === o.supplierId)); }}>Print</button>{' '}
                        {o.status !== 'cancelled' && <button type="button" className="btn-reload" onClick={() => setInvoiceForm({ ...blankInvoice(), poId: o.id, supplierId: o.supplierId || '', subtotal: String(o.subtotal), taxTotal: String(o.taxTotal) })}>+ Bill</button>}{' '}
                        {o.status !== 'received' && o.status !== 'partial' && <button type="button" className="btn-reload" style={{ color: '#B91C1C' }} onClick={() => confirm(`Delete ${o.poNumber}?`) && run(() => call('DELETE', 'purchase-orders', undefined, `?id=${o.id}`), 'Purchase order deleted.')}><IconTrash /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───── Invoices ───── */}
      {view === 'invoices' && (
        <div className="admin-table-card">
          {fInvoices.length === 0 ? <Empty text="Record the bills you receive from suppliers and track what you have paid." /> : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead><tr><th>Bill No.</th><th>Date</th><th>Supplier</th><th>PO</th><th>Due</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>Balance</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {fInvoices.map((i) => (
                    <tr key={i.id}>
                      <td><strong>{i.invoiceNumber}</strong></td>
                      <td>{fmtDate(i.invoiceDate)}</td>
                      <td>{i.supplierName || '—'}</td>
                      <td>{i.poNumber || '—'}</td>
                      <td>{fmtDate(i.dueDate)}</td>
                      <td style={{ textAlign: 'right' }}>{inr(i.total)}</td>
                      <td style={{ textAlign: 'right' }}>{inr(i.amountPaid)}</td>
                      <td style={{ textAlign: 'right' }}>{inr(i.balance)}</td>
                      <td><Badge tone={i.isOverdue ? 'red' : payTone(i.paymentStatus)}>{i.isOverdue ? 'overdue' : i.paymentStatus}</Badge></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn-reload" style={{ background: '#ECFDF5', color: '#047857', borderColor: '#A7F3D0' }} onClick={async () => { const d = await call('GET', 'invoices', undefined, `?id=${i.id}`); setPayInvoice(d.invoice); }}>{i.paymentStatus === 'paid' ? 'Payments' : 'Pay'}</button>{' '}
                        <button type="button" className="btn-reload" onClick={() => setInvoiceForm({ id: i.id, invoiceNumber: i.invoiceNumber, supplierId: i.supplierId || '', poId: i.poId || '', invoiceDate: i.invoiceDate, dueDate: i.dueDate, subtotal: String(i.subtotal), taxTotal: String(i.taxTotal), notes: i.notes })}><IconEdit size={14} /></button>{' '}
                        <button type="button" className="btn-reload" style={{ color: '#B91C1C' }} onClick={() => confirm(`Delete bill ${i.invoiceNumber} and its payments?`) && run(() => call('DELETE', 'invoices', undefined, `?id=${i.id}`), 'Bill deleted.')}><IconTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───── Expenses ───── */}
      {view === 'expenses' && (
        <div className="admin-table-card">
          {fExpenses.length === 0 ? <Empty text="Add rent, electricity, salaries, consumables and other clinic expenses. Supplier bills are tracked under Invoices / Bills." /> : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th><th>Actions</th></tr></thead>
                <tbody>
                  {fExpenses.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.expenseDate)}</td>
                      <td><Badge tone="blue">{e.category}</Badge></td>
                      <td>{e.description || '—'}</td>
                      <td>{e.vendor || '—'}</td>
                      <td>{e.paymentMethod}</td>
                      <td style={{ textAlign: 'right' }}><strong>{inr(e.amount)}</strong></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn-reload" onClick={() => setExpenseForm(e)}><IconEdit size={14} /></button>{' '}
                        <button type="button" className="btn-reload" style={{ color: '#B91C1C' }} onClick={() => confirm('Delete this expense?') && run(() => call('DELETE', 'expenses', undefined, `?id=${e.id}`), 'Expense deleted.')}><IconTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>Total shown</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(fExpenses.reduce((a, e) => a + e.amount, 0))}</td><td /></tr></tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───── Suppliers ───── */}
      {view === 'suppliers' && (
        <div className="admin-table-card">
          {fSuppliers.length === 0 ? <Empty text="Add the distributors and pharmacies you buy medicines from." /> : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>GSTIN</th><th>Outstanding</th><th>Actions</th></tr></thead>
                <tbody>
                  {fSuppliers.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong><div style={{ fontSize: 12, color: '#94A3B8' }}>{s.email}</div></td>
                      <td>{s.contactPerson || '—'}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.gstin || '—'}</td>
                      <td>{inr(invoices.filter((i) => i.supplierId === s.id).reduce((a, i) => a + i.balance, 0))}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn-reload" onClick={() => setSupplierForm(s)}><IconEdit size={14} /></button>{' '}
                        <button type="button" className="btn-reload" style={{ color: '#B91C1C' }} onClick={() => confirm(`Delete ${s.name}?`) && run(() => call('DELETE', 'suppliers', undefined, `?id=${s.id}`), 'Supplier deleted.')}><IconTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading && !summary && <p style={{ color: '#94A3B8' }}>Loading…</p>}

      {/* ───── Drawers ───── */}
      {supplierForm && <SupplierDrawer value={supplierForm} onClose={() => setSupplierForm(null)} onSave={async (v) => (await run(() => call(v.id ? 'PATCH' : 'POST', 'suppliers', v), 'Supplier saved.')) && setSupplierForm(null)} />}
      {poForm && <PoDrawer value={poForm} suppliers={suppliers} stock={stock} onClose={() => setPoForm(null)} onSave={async (v, markOrdered) => (await run(() => call(v.id ? 'PATCH' : 'POST', 'purchase-orders', { ...v, status: markOrdered ? 'ordered' : 'draft' }).then(async (d) => { if (v.id && markOrdered) await call('POST', 'purchase-orders', { action: 'status', id: v.id, status: 'ordered' }); return d; }), 'Purchase order saved.')) && setPoForm(null)} />}
      {receivePo && <ReceiveDrawer po={receivePo} onClose={() => setReceivePo(null)} onSave={async (lines) => (await run(() => call('POST', 'purchase-orders', { action: 'receive', id: receivePo.id, lines }), 'Stock received and updated.')) && setReceivePo(null)} />}
      {invoiceForm && <InvoiceDrawer value={invoiceForm} suppliers={suppliers} orders={orders} onClose={() => setInvoiceForm(null)} onSave={async (v) => (await run(() => call(v.id ? 'PATCH' : 'POST', 'invoices', v), 'Bill saved.')) && setInvoiceForm(null)} />}
      {payInvoice && <PaymentDrawer invoice={payInvoice} onClose={() => setPayInvoice(null)} onPay={async (p) => { const ok = await run(() => call('POST', 'invoices', { action: 'payment', id: payInvoice.id, ...p }), 'Payment recorded.'); if (ok) setPayInvoice(null); }} onDeletePayment={async (pid) => { if (!confirm('Remove this payment?')) return; const ok = await run(() => call('POST', 'invoices', { action: 'delete-payment', paymentId: pid }), 'Payment removed.'); if (ok) setPayInvoice(null); }} />}
      {expenseForm && <ExpenseDrawer value={expenseForm} onClose={() => setExpenseForm(null)} onSave={async (v) => (await run(() => call(v.id ? 'PATCH' : 'POST', 'expenses', v), 'Expense saved.')) && setExpenseForm(null)} />}
      {stockItem && <StockDrawer item={stockItem} call={call} onClose={() => setStockItem(null)} onDone={async () => { setStockItem(null); await reload(); }} />}
    </div>
  );
}

/* ───────────────────────── small pieces ───────────────────────── */

function Kpi({ icon, label, value, meta }: { icon: React.ReactNode; label: string; value: string; meta: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon-box">{icon}</div>
      <div className="kpi-info">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        <span className="kpi-meta">{meta}</span>
      </div>
    </div>
  );
}

function TrendBars({ data }: { data: InventorySummary['trend'] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.purchases, d.expenses]));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150 }}>
        {data.map((d) => (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
              <div title={`Purchases ${inr(d.purchases)}`} style={{ width: 14, height: `${(d.purchases / max) * 100}%`, minHeight: d.purchases ? 3 : 0, background: '#6366F1', borderRadius: 3 }} />
              <div title={`Expenses ${inr(d.expenses)}`} style={{ width: 14, height: `${(d.expenses / max) * 100}%`, minHeight: d.expenses ? 3 : 0, background: '#F59E0B', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11, color: '#64748B' }}>{d.month.slice(5)}/{d.month.slice(2, 4)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748B', marginTop: 8 }}>
        <span><span style={{ color: '#6366F1' }}>■</span> Supplier bills</span>
        <span><span style={{ color: '#F59E0B' }}>■</span> Other expenses</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="rx-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ── Supplier ── */
function SupplierDrawer({ value, onClose, onSave }: { value: Partial<Supplier>; onClose: () => void; onSave: (v: Partial<Supplier>) => Promise<unknown> }) {
  const [f, setF] = useState<Partial<Supplier>>(value);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Supplier, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Drawer title={f.id ? 'Edit Supplier' : 'Add Supplier'} onClose={onClose} width={540}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(f); setBusy(false); }}>
        <Field label="Supplier / Distributor name *"><input required autoFocus value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="rx-row-2">
          <Field label="Contact person"><input value={f.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)} /></Field>
          <Field label="Phone"><input value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        </div>
        <div className="rx-row-2">
          <Field label="Email"><input type="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="GSTIN"><input value={f.gstin || ''} onChange={(e) => set('gstin', e.target.value)} /></Field>
        </div>
        <Field label="Address"><textarea rows={2} value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        <FormFooter onCancel={onClose} busy={busy} label={f.id ? 'Save Changes' : 'Add Supplier'} />
      </form>
    </Drawer>
  );
}

/* ── Purchase order ── */
interface PoLine { medicineId: string | null; medicineName: string; potency: string; form: string; quantity: number; unitCost: number; taxPercent: number }
interface PoFormState { id?: string; supplierId: string; orderDate: string; expectedDate: string; notes: string; items: PoLine[] }
const blankItem = (): PoLine => ({ medicineId: null, medicineName: '', potency: '', form: '', quantity: 1, unitCost: 0, taxPercent: 12 });
const poToForm = (po: PurchaseOrder): PoFormState => ({
  id: po.id,
  supplierId: po.supplierId || '',
  orderDate: po.orderDate,
  expectedDate: po.expectedDate,
  notes: po.notes,
  items: (po.items || []).map((i: PurchaseOrderItem) => ({ medicineId: i.medicineId, medicineName: i.medicineName, potency: i.potency, form: i.form, quantity: i.quantity, unitCost: i.unitCost, taxPercent: i.taxPercent })),
});

function PoDrawer({ value, suppliers, stock, onClose, onSave }: { value: PoFormState; suppliers: Supplier[]; stock: StockItem[]; onClose: () => void; onSave: (v: PoFormState, markOrdered: boolean) => Promise<unknown> }) {
  const [f, setF] = useState<PoFormState>(value);
  const [busy, setBusy] = useState(false);
  const setItem = (idx: number, patch: Partial<PoLine>) => setF((p) => ({ ...p, items: p.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const pick = (idx: number, name: string) => {
    const m = stock.find((s) => s.name.toLowerCase() === name.toLowerCase());
    setItem(idx, m ? { medicineName: m.name, medicineId: m.id, potency: m.potency, form: m.form, unitCost: m.unitCost || f.items[idx].unitCost } : { medicineName: name, medicineId: null });
  };
  const subtotal = f.items.reduce((a, i) => a + i.quantity * i.unitCost, 0);
  const tax = f.items.reduce((a, i) => a + i.quantity * i.unitCost * (i.taxPercent / 100), 0);
  const submit = (markOrdered: boolean) => async () => { setBusy(true); await onSave(f, markOrdered); setBusy(false); };
  return (
    <Drawer title={f.id ? 'Edit Purchase Order' : 'New Purchase Order'} subtitle="Pick medicines from your catalogue, or type a new one — it is added to the catalogue when received." onClose={onClose} width={860}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }} onSubmit={(e) => { e.preventDefault(); submit(false)(); }}>
        <div className="rx-row-2">
          <Field label="Supplier"><select value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}><option value="">— Select supplier —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <div className="rx-row-2">
            <Field label="Order date"><input type="date" value={f.orderDate} onChange={(e) => setF({ ...f, orderDate: e.target.value })} /></Field>
            <Field label="Expected by"><input type="date" value={f.expectedDate} onChange={(e) => setF({ ...f, expectedDate: e.target.value })} /></Field>
          </div>
        </div>

        <datalist id="po-medicine-list">{stock.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        <div className="table-responsive">
          <table className="admin-table" style={{ fontSize: 13, tableLayout: 'fixed', width: '100%' }}>
            <thead><tr><th style={{ width: '34%' }}>Medicine</th><th style={{ width: '14%' }}>Potency</th><th style={{ width: '11%' }}>Qty</th><th style={{ width: '15%' }}>Unit cost ₹</th><th style={{ width: '10%' }}>GST %</th><th style={{ textAlign: 'right', width: '12%' }}>Line total</th><th style={{ width: 44 }} /></tr></thead>
            <tbody>
              {f.items.map((it, idx) => (
                <tr key={idx}>
                  <td><input className="rx-input" list="po-medicine-list" value={it.medicineName} onChange={(e) => pick(idx, e.target.value)} placeholder="Type or pick medicine" /></td>
                  <td><input className="rx-input" value={it.potency} onChange={(e) => setItem(idx, { potency: e.target.value })} placeholder="30C" /></td>
                  <td><input className="rx-input" type="number" min={1} value={it.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} /></td>
                  <td><input className="rx-input" type="number" min={0} step="0.01" value={it.unitCost} onChange={(e) => setItem(idx, { unitCost: Number(e.target.value) })} /></td>
                  <td><input className="rx-input" type="number" min={0} max={100} step="0.5" value={it.taxPercent} onChange={(e) => setItem(idx, { taxPercent: Number(e.target.value) })} /></td>
                  <td style={{ textAlign: 'right' }}>{inr(it.quantity * it.unitCost * (1 + it.taxPercent / 100))}</td>
                  <td><button type="button" className="btn-reload" disabled={f.items.length === 1} onClick={() => setF({ ...f, items: f.items.filter((_, i) => i !== idx) })}><IconTrash /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><button type="button" className="btn-reload" onClick={() => setF({ ...f, items: [...f.items, blankItem()] })}><IconPlus /><span>Add item</span></button></div>

        <div style={{ alignSelf: 'flex-end', minWidth: 240, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{inr(subtotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>GST</span><span>{inr(tax)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #E2E8F0', marginTop: 4, paddingTop: 4 }}><span>Total</span><span>{inr(subtotal + tax)}</span></div>
        </div>

        <Field label="Notes to supplier"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <FormFooter onCancel={onClose} busy={busy} label="Save as Draft" extra={<button type="button" className="rx-btn rx-btn-outline" disabled={busy} onClick={submit(true)}>Save &amp; Mark Ordered</button>} />
      </form>
    </Drawer>
  );
}

function ReceiveDrawer({ po, onClose, onSave }: { po: PurchaseOrder; onClose: () => void; onSave: (lines: Array<{ itemId: string; qty: number }>) => Promise<unknown> }) {
  const items = po.items || [];
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.id, Math.max(0, i.quantity - i.receivedQty)])));
  const [busy, setBusy] = useState(false);
  return (
    <Drawer title={`Receive stock — ${po.poNumber}`} subtitle="Enter what actually arrived. Stock levels update immediately." onClose={onClose} width={720}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(items.map((i) => ({ itemId: i.id, qty: qty[i.id] || 0 }))); setBusy(false); }}>
        <table className="admin-table" style={{ fontSize: 13 }}>
          <thead><tr><th>Medicine</th><th style={{ textAlign: 'right' }}>Ordered</th><th style={{ textAlign: 'right' }}>Already received</th><th>Receive now</th></tr></thead>
          <tbody>
            {items.map((i) => {
              const remaining = i.quantity - i.receivedQty;
              return (
                <tr key={i.id}>
                  <td>{i.medicineName} {i.potency && <small style={{ color: '#94A3B8' }}>{i.potency}</small>}</td>
                  <td style={{ textAlign: 'right' }}>{i.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{i.receivedQty}</td>
                  <td><input className="rx-input" type="number" min={0} max={remaining} disabled={remaining <= 0} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Math.min(remaining, Math.max(0, Number(e.target.value))) })} style={{ width: 110 }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <FormFooter onCancel={onClose} busy={busy} label="Confirm Receipt" />
      </form>
    </Drawer>
  );
}

/* ── Invoice ── */
interface InvoiceFormState { id?: string; invoiceNumber: string; supplierId: string; poId: string; invoiceDate: string; dueDate: string; subtotal: string; taxTotal: string; notes: string }
const blankInvoice = (): InvoiceFormState => ({ invoiceNumber: '', supplierId: '', poId: '', invoiceDate: today(), dueDate: '', subtotal: '', taxTotal: '0', notes: '' });

function InvoiceDrawer({ value, suppliers, orders, onClose, onSave }: { value: InvoiceFormState; suppliers: Supplier[]; orders: PurchaseOrder[]; onClose: () => void; onSave: (v: InvoiceFormState) => Promise<unknown> }) {
  const [f, setF] = useState(value);
  const [busy, setBusy] = useState(false);
  const total = (Number(f.subtotal) || 0) + (Number(f.taxTotal) || 0);
  const pickPo = (poId: string) => {
    const po = orders.find((o) => o.id === poId);
    setF(po ? { ...f, poId, supplierId: po.supplierId || f.supplierId, subtotal: f.subtotal || String(po.subtotal), taxTotal: f.subtotal ? f.taxTotal : String(po.taxTotal) } : { ...f, poId: '' });
  };
  return (
    <Drawer title={f.id ? 'Edit Supplier Bill' : 'Add Supplier Bill'} subtitle="Enter the bill exactly as printed on the supplier's invoice." onClose={onClose} width={600}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(f); setBusy(false); }}>
        <div className="rx-row-2">
          <Field label="Supplier bill / invoice no. *"><input required autoFocus value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} /></Field>
          <Field label="Linked purchase order"><select value={f.poId} onChange={(e) => pickPo(e.target.value)}><option value="">— None —</option>{orders.filter((o) => o.status !== 'cancelled').map((o) => <option key={o.id} value={o.id}>{o.poNumber}{o.supplierName ? ` · ${o.supplierName}` : ''}</option>)}</select></Field>
        </div>
        <Field label="Supplier"><select value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}><option value="">— Select supplier —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <div className="rx-row-2">
          <Field label="Bill date"><input type="date" required value={f.invoiceDate} onChange={(e) => setF({ ...f, invoiceDate: e.target.value })} /></Field>
          <Field label="Payment due date"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <div className="rx-row-2">
          <Field label="Amount before GST (₹) *"><input type="number" required min={0} step="0.01" value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} /></Field>
          <Field label="GST amount (₹)"><input type="number" min={0} step="0.01" value={f.taxTotal} onChange={(e) => setF({ ...f, taxTotal: e.target.value })} /></Field>
        </div>
        <div style={{ fontWeight: 700, textAlign: 'right' }}>Bill total: {inr(total)}</div>
        <Field label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <FormFooter onCancel={onClose} busy={busy} label={f.id ? 'Save Changes' : 'Save Bill'} />
      </form>
    </Drawer>
  );
}

function PaymentDrawer({ invoice, onClose, onPay, onDeletePayment }: { invoice: Invoice; onClose: () => void; onPay: (p: { amount: number; method: string; paidOn: string; reference: string }) => Promise<unknown>; onDeletePayment: (id: string) => Promise<unknown> }) {
  const [amount, setAmount] = useState(String(invoice.balance || ''));
  const [method, setMethod] = useState<string>('UPI');
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Drawer title={`Bill ${invoice.invoiceNumber}`} subtitle={`${invoice.supplierName || 'Supplier'} · Total ${inr(invoice.total)} · Balance ${inr(invoice.balance)}`} onClose={onClose} width={560}>
      {invoice.balance > 0 && (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onPay({ amount: Number(amount), method, paidOn, reference }); setBusy(false); }}>
          <div className="rx-row-2">
            <Field label="Amount paid (₹) *"><input type="number" required min={0.01} max={invoice.balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Date"><input type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
          </div>
          <div className="rx-row-2">
            <Field label="Method"><select value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Reference / UTR / cheque no."><input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          </div>
          <FormFooter onCancel={onClose} busy={busy} label="Record Payment" />
        </form>
      )}
      <div>
        <h4 style={{ margin: '4px 0 8px' }}>Payment history</h4>
        {(invoice.payments || []).length === 0 ? <p style={{ color: '#94A3B8', fontSize: 13 }}>No payments recorded yet.</p> : (
          <table className="admin-table" style={{ fontSize: 13 }}>
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead>
            <tbody>
              {(invoice.payments || []).map((p) => (
                <tr key={p.id}><td>{fmtDate(p.paidOn)}</td><td>{p.method}</td><td>{p.reference || '—'}</td><td style={{ textAlign: 'right' }}>{inr(p.amount)}</td><td><button type="button" className="btn-reload" style={{ color: '#B91C1C' }} onClick={() => onDeletePayment(p.id)}><IconTrash /></button></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Drawer>
  );
}

/* ── Expense ── */
function ExpenseDrawer({ value, onClose, onSave }: { value: Partial<Expense>; onClose: () => void; onSave: (v: Partial<Expense>) => Promise<unknown> }) {
  const [f, setF] = useState<Partial<Expense>>(value);
  const [busy, setBusy] = useState(false);
  return (
    <Drawer title={f.id ? 'Edit Expense' : 'Add Expense'} onClose={onClose} width={540}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(f); setBusy(false); }}>
        <div className="rx-row-2">
          <Field label="Date *"><input type="date" required value={f.expenseDate || today()} onChange={(e) => setF({ ...f, expenseDate: e.target.value })} /></Field>
          <Field label="Category *"><select value={f.category || EXPENSE_CATEGORIES[0]} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field label="Description"><input autoFocus value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Clinic electricity bill – October" /></Field>
        <div className="rx-row-2">
          <Field label="Amount (₹) *"><input type="number" required min={0.01} step="0.01" value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
          <Field label="Paid via"><select value={f.paymentMethod || 'Cash'} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        </div>
        <div className="rx-row-2">
          <Field label="Vendor / payee"><input value={f.vendor || ''} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
          <Field label="Reference"><input value={f.reference || ''} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <FormFooter onCancel={onClose} busy={busy} label={f.id ? 'Save Changes' : 'Add Expense'} />
      </form>
    </Drawer>
  );
}

/* ── Stock adjust ── */
function StockDrawer({ item, call, onClose, onDone }: { item: StockItem; call: (m: string, r: string, b?: unknown, q?: string) => Promise<any>; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [reorder, setReorder] = useState(String(item.reorderLevel));
  const [cost, setCost] = useState(String(item.unitCost));
  const [moves, setMoves] = useState<StockMovement[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call('GET', 'movements', undefined, `?medicineId=${item.id}&limit=15`).then((d) => setMoves(d.movements)).catch(() => {});
  }, [call, item.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (Number(delta)) await call('POST', 'stock', { action: 'adjust', medicineId: item.id, delta: Number(delta), reason });
      await call('PATCH', 'stock', { medicineId: item.id, reorderLevel: Number(reorder), unitCost: Number(cost) });
      toast.success('Stock updated.');
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update stock.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer title={item.name} subtitle={`Currently ${item.stockQty} in stock`} onClose={onClose} width={540}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={save}>
        <div className="rx-row-2">
          <Field label="Adjust quantity (+ add / − remove)"><input type="number" step={1} value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -2 for damaged" /></Field>
          <Field label="Reason (required for adjustments)"><input value={reason} required={!!Number(delta)} onChange={(e) => setReason(e.target.value)} placeholder="Recount, damaged, expired…" /></Field>
        </div>
        <div className="rx-row-2">
          <Field label="Reorder level"><input type="number" min={0} value={reorder} onChange={(e) => setReorder(e.target.value)} /></Field>
          <Field label="Unit cost (₹)"><input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        </div>
        <FormFooter onCancel={onClose} busy={busy} label="Save" />
      </form>
      <div>
        <h4 style={{ margin: '4px 0 8px' }}>Recent movements</h4>
        {moves.length === 0 ? <p style={{ color: '#94A3B8', fontSize: 13 }}>No stock movements yet.</p> : moves.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #F1F5F9' }}>
            <span>{new Date(m.createdAt).toLocaleDateString('en-IN')} · {m.reference || m.reason}</span>
            <strong style={{ color: m.qtyChange > 0 ? '#047857' : '#B91C1C' }}>{m.qtyChange > 0 ? '+' : ''}{m.qtyChange}</strong>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

/* ── Print PO (browser print → PDF) ── */
function printPo(po: PurchaseOrder, supplier?: Supplier) {
  const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const rows = (po.items || []).map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.medicineName)} ${esc(i.potency)}</td><td>${esc(i.form)}</td><td class="r">${i.quantity}</td><td class="r">${i.unitCost.toFixed(2)}</td><td class="r">${i.taxPercent}%</td><td class="r">${i.lineTotal.toFixed(2)}</td></tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) return toast.warning('Allow pop-ups to print the purchase order.');
  w.document.write(`<html><head><title>${esc(po.poNumber)}</title><style>body{font:14px Arial;padding:28px;color:#111}h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}.r{text-align:right}.t{margin-top:12px;text-align:right}</style></head><body>
  <h2>Happy Morning Piles Clinic</h2><div>Purchase Order <strong>${esc(po.poNumber)}</strong> · ${esc(po.orderDate)}</div>
  <p><strong>To:</strong> ${esc(po.supplierName || '—')}${supplier?.address ? '<br>' + esc(supplier.address) : ''}${supplier?.phone ? '<br>Phone: ' + esc(supplier.phone) : ''}${supplier?.gstin ? '<br>GSTIN: ' + esc(supplier.gstin) : ''}</p>
  <table><thead><tr><th>#</th><th>Medicine</th><th>Form</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="t">Subtotal: ₹${po.subtotal.toFixed(2)}<br>GST: ₹${po.taxTotal.toFixed(2)}<br><strong>Total: ₹${po.total.toFixed(2)}</strong></div>
  ${po.expectedDate ? `<p>Expected delivery: ${esc(po.expectedDate)}</p>` : ''}${po.notes ? `<p>Notes: ${esc(po.notes)}</p>` : ''}
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}