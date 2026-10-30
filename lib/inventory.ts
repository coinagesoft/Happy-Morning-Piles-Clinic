import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import crypto from 'crypto';
import { getPool, ensureDatabaseSchema } from './db';
import {
  PO_STATUSES,
  type Supplier,
  type StockItem,
  type StockMovement,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PoStatus,
  type Invoice,
  type InvoicePayment,
  type Expense,
  type InventorySummary,
} from './inventoryConstants';

type Row = RowDataPacket & Record<string, any>;

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v == null ? '' : String(v));
const round2 = (n: number) => Math.round(n * 100) / 100;
const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();

async function withTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  await ensureDatabaseSchema();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* ───────────────────────── Suppliers ───────────────────────── */

const mapSupplier = (r: Row): Supplier => ({
  id: r.id,
  name: r.name,
  contactPerson: str(r.contact_person),
  phone: str(r.phone),
  email: str(r.email),
  gstin: str(r.gstin),
  address: str(r.address),
  notes: str(r.notes),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listSuppliers(): Promise<Supplier[]> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().query<Row[]>(`SELECT * FROM suppliers ORDER BY name ASC`);
  return rows.map(mapSupplier);
}

export async function saveSupplier(input: Partial<Supplier> & { name: string }): Promise<Supplier> {
  await ensureDatabaseSchema();
  const name = str(input.name).trim();
  if (!name) throw new Error('Supplier name is required.');
  const pool = getPool();
  const now = nowIso();
  const vals = [
    name,
    str(input.contactPerson).trim(),
    str(input.phone).trim(),
    str(input.email).trim(),
    str(input.gstin).trim().toUpperCase(),
    str(input.address).trim(),
    str(input.notes).trim(),
  ];
  let id = input.id;
  if (id) {
    const [res] = await pool.execute(
      `UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, gstin=?, address=?, notes=?, updated_at=? WHERE id=?`,
      [...vals, now, id]
    );
    if (!(res as { affectedRows?: number }).affectedRows) throw new Error('Supplier not found.');
    // keep denormalised names in sync
    await pool.execute(`UPDATE purchase_orders SET supplier_name=? WHERE supplier_id=?`, [name, id]);
    await pool.execute(`UPDATE purchase_invoices SET supplier_name=? WHERE supplier_id=?`, [name, id]);
  } else {
    id = uid();
    await pool.execute(
      `INSERT INTO suppliers (id, name, contact_person, phone, email, gstin, address, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, ...vals, now, now]
    );
  }
  const [rows] = await pool.execute<Row[]>(`SELECT * FROM suppliers WHERE id=?`, [id]);
  return mapSupplier(rows[0]);
}

export async function deleteSupplier(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const [used] = await pool.execute<Row[]>(
    `SELECT (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=?) +
            (SELECT COUNT(*) FROM purchase_invoices WHERE supplier_id=?) AS n`,
    [id, id]
  );
  if (num(used[0]?.n) > 0) {
    throw new Error('This supplier has purchase orders or invoices and cannot be deleted.');
  }
  const [res] = await pool.execute(`DELETE FROM suppliers WHERE id=?`, [id]);
  return !!(res as { affectedRows?: number }).affectedRows;
}

/* ───────────────────────── Stock ───────────────────────── */

const mapStock = (r: Row): StockItem => {
  const stockQty = num(r.stock_qty);
  const reorderLevel = num(r.reorder_level);
  const unitCost = num(r.unit_cost);
  return {
    id: r.id,
    name: r.name,
    potency: str(r.potency),
    form: str(r.form),
    category: str(r.category) || 'General',
    stockQty,
    reorderLevel,
    unitCost,
    stockValue: round2(stockQty * unitCost),
    isLow: stockQty <= reorderLevel,
  };
};

export async function listStock(search?: string): Promise<StockItem[]> {
  await ensureDatabaseSchema();
  const q = search?.trim();
  const [rows] = q
    ? await getPool().execute<Row[]>(
        `SELECT * FROM medicines WHERE name LIKE ? OR category LIKE ? OR form LIKE ? ORDER BY name ASC`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      )
    : await getPool().query<Row[]>(`SELECT * FROM medicines ORDER BY name ASC`);
  return rows.map(mapStock);
}

export async function updateStockSettings(
  medicineId: string,
  input: { reorderLevel?: number; unitCost?: number }
): Promise<void> {
  await ensureDatabaseSchema();
  const reorder = Math.max(0, Math.floor(num(input.reorderLevel)));
  const cost = Math.max(0, round2(num(input.unitCost)));
  const [res] = await getPool().execute(
    `UPDATE medicines SET reorder_level=?, unit_cost=?, updated_at=? WHERE id=?`,
    [reorder, cost, nowIso(), medicineId]
  );
  if (!(res as { affectedRows?: number }).affectedRows) throw new Error('Medicine not found.');
}

async function applyStockChange(
  conn: PoolConnection,
  medicineId: string,
  delta: number,
  type: 'purchase' | 'adjustment',
  reference: string,
  reason: string
) {
  const [rows] = await conn.execute<Row[]>(`SELECT name, stock_qty FROM medicines WHERE id=? FOR UPDATE`, [medicineId]);
  if (!rows.length) throw new Error('Medicine not found.');
  const next = num(rows[0].stock_qty) + delta;
  if (next < 0) throw new Error(`Stock for ${rows[0].name} cannot go below zero.`);
  await conn.execute(`UPDATE medicines SET stock_qty=?, updated_at=? WHERE id=?`, [next, nowIso(), medicineId]);
  await conn.execute(
    `INSERT INTO stock_movements (id, medicine_id, medicine_name, type, qty_change, reference, reason, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [uid(), medicineId, rows[0].name, type, delta, reference, reason, nowIso()]
  );
}

export async function adjustStock(medicineId: string, delta: number, reason: string): Promise<void> {
  const d = Math.trunc(num(delta));
  if (!d) throw new Error('Adjustment quantity cannot be zero.');
  if (!reason.trim()) throw new Error('Please give a reason (e.g. damaged, expired, recount).');
  await withTx((conn) => applyStockChange(conn, medicineId, d, 'adjustment', '', reason.trim()));
}

export async function listMovements(medicineId?: string, limit = 100): Promise<StockMovement[]> {
  await ensureDatabaseSchema();
  const lim = Math.min(500, Math.max(1, Math.floor(limit)));
  const [rows] = medicineId
    ? await getPool().execute<Row[]>(
        `SELECT * FROM stock_movements WHERE medicine_id=? ORDER BY created_at DESC LIMIT ${lim}`,
        [medicineId]
      )
    : await getPool().query<Row[]>(`SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT ${lim}`);
  return rows.map((r) => ({
    id: r.id,
    medicineId: r.medicine_id,
    medicineName: r.medicine_name,
    type: r.type,
    qtyChange: num(r.qty_change),
    reference: str(r.reference),
    reason: str(r.reason),
    createdAt: r.created_at,
  }));
}

/* ───────────────────────── Purchase Orders ───────────────────────── */

export interface PoItemInput {
  medicineId?: string | null;
  medicineName: string;
  potency?: string;
  form?: string;
  quantity: number;
  unitCost: number;
  taxPercent?: number;
}

export interface PoInput {
  supplierId?: string | null;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  status?: PoStatus;
  items: PoItemInput[];
}

const mapPoItem = (r: Row): PurchaseOrderItem => ({
  id: r.id,
  poId: r.po_id,
  medicineId: r.medicine_id || null,
  medicineName: r.medicine_name,
  potency: str(r.potency),
  form: str(r.form),
  quantity: num(r.quantity),
  receivedQty: num(r.received_qty),
  unitCost: num(r.unit_cost),
  taxPercent: num(r.tax_percent),
  lineTotal: num(r.line_total),
});

const mapPo = (r: Row): PurchaseOrder => ({
  id: r.id,
  poNumber: r.po_number,
  supplierId: r.supplier_id || null,
  supplierName: str(r.supplier_name),
  orderDate: r.order_date,
  expectedDate: str(r.expected_date),
  status: r.status,
  notes: str(r.notes),
  subtotal: num(r.subtotal),
  taxTotal: num(r.tax_total),
  total: num(r.total),
  itemCount: num(r.item_count),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function priceItems(items: PoItemInput[]) {
  const clean = items
    .map((i) => ({
      medicineId: i.medicineId || null,
      medicineName: str(i.medicineName).trim(),
      potency: str(i.potency).trim(),
      form: str(i.form).trim(),
      quantity: Math.floor(num(i.quantity)),
      unitCost: round2(num(i.unitCost)),
      taxPercent: Math.min(100, Math.max(0, num(i.taxPercent))),
    }))
    .filter((i) => i.medicineName && i.quantity > 0);
  if (!clean.length) throw new Error('Add at least one medicine with a quantity above zero.');
  let subtotal = 0;
  let taxTotal = 0;
  const priced = clean.map((i) => {
    const base = i.quantity * i.unitCost;
    const tax = base * (i.taxPercent / 100);
    subtotal += base;
    taxTotal += tax;
    return { ...i, lineTotal: round2(base + tax) };
  });
  return { priced, subtotal: round2(subtotal), taxTotal: round2(taxTotal), total: round2(subtotal + taxTotal) };
}

async function supplierName(conn: PoolConnection, supplierId?: string | null): Promise<string> {
  if (!supplierId) return '';
  const [r] = await conn.execute<Row[]>(`SELECT name FROM suppliers WHERE id=?`, [supplierId]);
  return r[0]?.name || '';
}

async function insertPoItems(conn: PoolConnection, poId: string, priced: ReturnType<typeof priceItems>['priced']) {
  for (const i of priced) {
    await conn.execute(
      `INSERT INTO purchase_order_items
        (id, po_id, medicine_id, medicine_name, potency, form, quantity, received_qty, unit_cost, tax_percent, line_total)
       VALUES (?,?,?,?,?,?,?,0,?,?,?)`,
      [uid(), poId, i.medicineId, i.medicineName, i.potency, i.form, i.quantity, i.unitCost, i.taxPercent, i.lineTotal]
    );
  }
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().query<Row[]>(
    `SELECT po.*, (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.id) AS item_count
     FROM purchase_orders po ORDER BY po.order_date DESC, po.created_at DESC`
  );
  return rows.map(mapPo);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const [rows] = await pool.execute<Row[]>(
    `SELECT po.*, (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.id) AS item_count
     FROM purchase_orders po WHERE po.id=?`,
    [id]
  );
  if (!rows.length) return null;
  const [items] = await pool.execute<Row[]>(`SELECT * FROM purchase_order_items WHERE po_id=? ORDER BY medicine_name`, [id]);
  return { ...mapPo(rows[0]), items: items.map(mapPoItem) };
}

export async function createPurchaseOrder(input: PoInput): Promise<PurchaseOrder> {
  const { priced, subtotal, taxTotal, total } = priceItems(input.items || []);
  const id = uid();
  const status: PoStatus = input.status === 'ordered' ? 'ordered' : 'draft';
  await withTx(async (conn) => {
    const now = nowIso();
    const date = input.orderDate || todayStr();
    const poNumber = `PO-${date.replace(/-/g, '')}-${String(Math.floor(Math.random() * 900) + 100)}`;
    await conn.execute(
      `INSERT INTO purchase_orders
        (id, po_number, supplier_id, supplier_name, order_date, expected_date, status, notes, subtotal, tax_total, total, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        poNumber,
        input.supplierId || null,
        await supplierName(conn, input.supplierId),
        date,
        input.expectedDate || '',
        status,
        str(input.notes).trim(),
        subtotal,
        taxTotal,
        total,
        now,
        now,
      ]
    );
    await insertPoItems(conn, id, priced);
  });
  return (await getPurchaseOrder(id))!;
}

export async function updatePurchaseOrder(id: string, input: PoInput): Promise<PurchaseOrder> {
  const existing = await getPurchaseOrder(id);
  if (!existing) throw new Error('Purchase order not found.');
  if (existing.status !== 'draft' && existing.status !== 'ordered') {
    throw new Error('Only draft or ordered purchase orders can be edited.');
  }
  const { priced, subtotal, taxTotal, total } = priceItems(input.items || []);
  await withTx(async (conn) => {
    await conn.execute(
      `UPDATE purchase_orders SET supplier_id=?, supplier_name=?, order_date=?, expected_date=?, notes=?,
         subtotal=?, tax_total=?, total=?, updated_at=? WHERE id=?`,
      [
        input.supplierId || null,
        await supplierName(conn, input.supplierId),
        input.orderDate || existing.orderDate,
        input.expectedDate || '',
        str(input.notes).trim(),
        subtotal,
        taxTotal,
        total,
        nowIso(),
        id,
      ]
    );
    await conn.execute(`DELETE FROM purchase_order_items WHERE po_id=?`, [id]);
    await insertPoItems(conn, id, priced);
  });
  return (await getPurchaseOrder(id))!;
}

export async function setPurchaseOrderStatus(id: string, status: PoStatus): Promise<void> {
  if (!PO_STATUSES.includes(status)) throw new Error('Invalid status.');
  const existing = await getPurchaseOrder(id);
  if (!existing) throw new Error('Purchase order not found.');
  if (['received', 'partial'].includes(existing.status) && status === 'cancelled') {
    throw new Error('A purchase order with received stock cannot be cancelled.');
  }
  if (status === 'received' || status === 'partial') {
    throw new Error('Use "Receive stock" to mark items as received.');
  }
  await ensureDatabaseSchema();
  await getPool().execute(`UPDATE purchase_orders SET status=?, updated_at=? WHERE id=?`, [status, nowIso(), id]);
}

export async function receivePurchaseOrder(
  id: string,
  lines: Array<{ itemId: string; qty: number }>
): Promise<PurchaseOrder> {
  await withTx(async (conn) => {
    const [pos] = await conn.execute<Row[]>(`SELECT po_number, status FROM purchase_orders WHERE id=? FOR UPDATE`, [id]);
    if (!pos.length) throw new Error('Purchase order not found.');
    if (pos[0].status === 'cancelled') throw new Error('This purchase order is cancelled.');
    if (pos[0].status === 'draft') throw new Error('Mark the purchase order as ordered before receiving stock.');

    const received = lines.filter((l) => Math.floor(num(l.qty)) > 0);
    if (!received.length) throw new Error('Enter a received quantity for at least one item.');

    for (const line of received) {
      const qty = Math.floor(num(line.qty));
      const [items] = await conn.execute<Row[]>(
        `SELECT * FROM purchase_order_items WHERE id=? AND po_id=? FOR UPDATE`,
        [line.itemId, id]
      );
      if (!items.length) throw new Error('Item does not belong to this purchase order.');
      const item = items[0];
      const remaining = num(item.quantity) - num(item.received_qty);
      if (qty > remaining) {
        throw new Error(`${item.medicine_name}: only ${remaining} left to receive.`);
      }

      // Resolve (or create) the medicine in the catalogue
      let medicineId: string | null = item.medicine_id || null;
      if (!medicineId) {
        const [m] = await conn.execute<Row[]>(`SELECT id FROM medicines WHERE name=? LIMIT 1`, [item.medicine_name]);
        if (m.length) {
          medicineId = m[0].id;
        } else {
          medicineId = uid();
          const now = nowIso();
          await conn.execute(
            `INSERT INTO medicines (id, name, potency, form, category, notes, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?)`,
            [medicineId, item.medicine_name, str(item.potency), str(item.form) || 'Dilution', 'General', '', now, now]
          );
        }
        await conn.execute(`UPDATE purchase_order_items SET medicine_id=? WHERE id=?`, [medicineId, item.id]);
      }

      await conn.execute(`UPDATE purchase_order_items SET received_qty = received_qty + ? WHERE id=?`, [qty, item.id]);
      await conn.execute(`UPDATE medicines SET unit_cost=? WHERE id=?`, [num(item.unit_cost), medicineId]);
      await applyStockChange(conn, medicineId!, qty, 'purchase', pos[0].po_number, 'Goods received');
    }

    const [tot] = await conn.execute<Row[]>(
      `SELECT SUM(quantity) AS q, SUM(received_qty) AS r FROM purchase_order_items WHERE po_id=?`,
      [id]
    );
    const q = num(tot[0].q);
    const r = num(tot[0].r);
    const status: PoStatus = r >= q ? 'received' : 'partial';
    await conn.execute(`UPDATE purchase_orders SET status=?, updated_at=? WHERE id=?`, [status, nowIso(), id]);
  });
  return (await getPurchaseOrder(id))!;
}

export async function deletePurchaseOrder(id: string): Promise<boolean> {
  const po = await getPurchaseOrder(id);
  if (!po) return false;
  if (po.status === 'received' || po.status === 'partial') {
    throw new Error('Purchase orders with received stock cannot be deleted. Cancel is not possible either, to keep stock history correct.');
  }
  await withTx(async (conn) => {
    await conn.execute(`UPDATE purchase_invoices SET po_id=NULL WHERE po_id=?`, [id]);
    await conn.execute(`DELETE FROM purchase_order_items WHERE po_id=?`, [id]);
    await conn.execute(`DELETE FROM purchase_orders WHERE id=?`, [id]);
  });
  return true;
}

/* ───────────────────────── Purchase Invoices (supplier bills) ───────────────────────── */

export interface InvoiceInput {
  invoiceNumber: string;
  supplierId?: string | null;
  poId?: string | null;
  invoiceDate?: string;
  dueDate?: string;
  subtotal: number;
  taxTotal?: number;
  notes?: string;
}

function derivePayment(total: number, paid: number): 'unpaid' | 'partial' | 'paid' {
  if (paid >= total - 0.005 && total > 0) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
}

const mapInvoice = (r: Row): Invoice => {
  const total = num(r.total);
  const paid = num(r.amount_paid);
  const status = derivePayment(total, paid);
  const due = str(r.due_date);
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    supplierId: r.supplier_id || null,
    supplierName: str(r.supplier_name),
    poId: r.po_id || null,
    poNumber: str(r.po_number),
    invoiceDate: r.invoice_date,
    dueDate: due,
    subtotal: num(r.subtotal),
    taxTotal: num(r.tax_total),
    total,
    amountPaid: paid,
    balance: round2(Math.max(0, total - paid)),
    paymentStatus: status,
    isOverdue: status !== 'paid' && !!due && due < todayStr(),
    notes: str(r.notes),
    createdAt: r.created_at,
  };
};

const INVOICE_SELECT = `SELECT i.*, po.po_number AS po_number
  FROM purchase_invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id`;

export async function listInvoices(): Promise<Invoice[]> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().query<Row[]>(`${INVOICE_SELECT} ORDER BY i.invoice_date DESC, i.created_at DESC`);
  return rows.map(mapInvoice);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const [rows] = await pool.execute<Row[]>(`${INVOICE_SELECT} WHERE i.id=?`, [id]);
  if (!rows.length) return null;
  const [pays] = await pool.execute<Row[]>(
    `SELECT * FROM invoice_payments WHERE invoice_id=? ORDER BY paid_on DESC, created_at DESC`,
    [id]
  );
  const payments: InvoicePayment[] = pays.map((p) => ({
    id: p.id,
    invoiceId: p.invoice_id,
    amount: num(p.amount),
    method: p.method,
    paidOn: p.paid_on,
    reference: str(p.reference),
  }));
  return { ...mapInvoice(rows[0]), payments };
}

export async function saveInvoice(input: InvoiceInput, id?: string): Promise<Invoice> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const number = str(input.invoiceNumber).trim();
  if (!number) throw new Error('Supplier invoice / bill number is required.');
  const subtotal = round2(Math.max(0, num(input.subtotal)));
  const taxTotal = round2(Math.max(0, num(input.taxTotal)));
  const total = round2(subtotal + taxTotal);
  if (total <= 0) throw new Error('Invoice amount must be greater than zero.');

  let name = '';
  if (input.supplierId) {
    const [s] = await pool.execute<Row[]>(`SELECT name FROM suppliers WHERE id=?`, [input.supplierId]);
    name = s[0]?.name || '';
  }
  const now = nowIso();
  const date = input.invoiceDate || todayStr();

  if (id) {
    const existing = await getInvoice(id);
    if (!existing) throw new Error('Invoice not found.');
    if (total < existing.amountPaid - 0.005) {
      throw new Error('Invoice total cannot be lower than the amount already paid.');
    }
    await pool.execute(
      `UPDATE purchase_invoices SET invoice_number=?, supplier_id=?, supplier_name=?, po_id=?, invoice_date=?, due_date=?,
         subtotal=?, tax_total=?, total=?, notes=?, updated_at=? WHERE id=?`,
      [number, input.supplierId || null, name, input.poId || null, date, input.dueDate || '', subtotal, taxTotal, total, str(input.notes).trim(), now, id]
    );
    return (await getInvoice(id))!;
  }

  const newId = uid();
  await pool.execute(
    `INSERT INTO purchase_invoices
      (id, invoice_number, supplier_id, supplier_name, po_id, invoice_date, due_date, subtotal, tax_total, total, amount_paid, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
    [newId, number, input.supplierId || null, name, input.poId || null, date, input.dueDate || '', subtotal, taxTotal, total, str(input.notes).trim(), now, now]
  );
  return (await getInvoice(newId))!;
}

export async function recordInvoicePayment(
  invoiceId: string,
  input: { amount: number; method?: string; paidOn?: string; reference?: string }
): Promise<Invoice> {
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');
  await withTx(async (conn) => {
    const [rows] = await conn.execute<Row[]>(`SELECT total, amount_paid FROM purchase_invoices WHERE id=? FOR UPDATE`, [invoiceId]);
    if (!rows.length) throw new Error('Invoice not found.');
    const balance = round2(num(rows[0].total) - num(rows[0].amount_paid));
    if (amount > balance + 0.005) throw new Error(`Payment exceeds the balance due (₹${balance.toFixed(2)}).`);
    await conn.execute(
      `INSERT INTO invoice_payments (id, invoice_id, amount, method, paid_on, reference, created_at) VALUES (?,?,?,?,?,?,?)`,
      [uid(), invoiceId, amount, str(input.method) || 'Cash', input.paidOn || todayStr(), str(input.reference).trim(), nowIso()]
    );
    await conn.execute(`UPDATE purchase_invoices SET amount_paid = amount_paid + ?, updated_at=? WHERE id=?`, [amount, nowIso(), invoiceId]);
  });
  return (await getInvoice(invoiceId))!;
}

export async function deleteInvoicePayment(paymentId: string): Promise<Invoice | null> {
  let invoiceId = '';
  await withTx(async (conn) => {
    const [p] = await conn.execute<Row[]>(`SELECT invoice_id, amount FROM invoice_payments WHERE id=?`, [paymentId]);
    if (!p.length) throw new Error('Payment not found.');
    invoiceId = p[0].invoice_id;
    await conn.execute(`DELETE FROM invoice_payments WHERE id=?`, [paymentId]);
    await conn.execute(`UPDATE purchase_invoices SET amount_paid = GREATEST(0, amount_paid - ?), updated_at=? WHERE id=?`, [
      num(p[0].amount),
      nowIso(),
      invoiceId,
    ]);
  });
  return getInvoice(invoiceId);
}

export async function deleteInvoice(id: string): Promise<boolean> {
  let ok = false;
  await withTx(async (conn) => {
    await conn.execute(`DELETE FROM invoice_payments WHERE invoice_id=?`, [id]);
    const [res] = await conn.execute(`DELETE FROM purchase_invoices WHERE id=?`, [id]);
    ok = !!(res as { affectedRows?: number }).affectedRows;
  });
  return ok;
}

/* ───────────────────────── Other Expenses ───────────────────────── */

const mapExpense = (r: Row): Expense => ({
  id: r.id,
  expenseDate: r.expense_date,
  category: r.category,
  description: str(r.description),
  vendor: str(r.vendor),
  amount: num(r.amount),
  paymentMethod: str(r.payment_method),
  reference: str(r.reference),
  createdAt: r.created_at,
});

export async function listExpenses(from?: string, to?: string): Promise<Expense[]> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<Row[]>(
    `SELECT * FROM expenses WHERE expense_date >= ? AND expense_date <= ? ORDER BY expense_date DESC, created_at DESC`,
    [from || '0000-01-01', to || '9999-12-31']
  );
  return rows.map(mapExpense);
}

export async function saveExpense(
  input: Partial<Expense> & { amount: number; category: string },
  id?: string
): Promise<Expense> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new Error('Expense amount must be greater than zero.');
  const now = nowIso();
  const vals = [
    input.expenseDate || todayStr(),
    str(input.category).trim() || 'Other',
    str(input.description).trim(),
    str(input.vendor).trim(),
    amount,
    str(input.paymentMethod) || 'Cash',
    str(input.reference).trim(),
  ];
  let rowId = id;
  if (rowId) {
    const [res] = await pool.execute(
      `UPDATE expenses SET expense_date=?, category=?, description=?, vendor=?, amount=?, payment_method=?, reference=?, updated_at=? WHERE id=?`,
      [...vals, now, rowId]
    );
    if (!(res as { affectedRows?: number }).affectedRows) throw new Error('Expense not found.');
  } else {
    rowId = uid();
    await pool.execute(
      `INSERT INTO expenses (id, expense_date, category, description, vendor, amount, payment_method, reference, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [rowId, ...vals, now, now]
    );
  }
  const [rows] = await pool.execute<Row[]>(`SELECT * FROM expenses WHERE id=?`, [rowId]);
  return mapExpense(rows[0]);
}

export async function deleteExpense(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const [res] = await getPool().execute(`DELETE FROM expenses WHERE id=?`, [id]);
  return !!(res as { affectedRows?: number }).affectedRows;
}

/* ───────────────────────── Dashboard summary ───────────────────────── */

export async function getInventorySummary(month?: string): Promise<InventorySummary> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const m = /^\d{4}-\d{2}$/.test(month || '') ? (month as string) : todayStr().slice(0, 7);
  const like = `${m}-%`;

  const one = async (sql: string, params: unknown[] = []) => {
    const [r] = await pool.execute<Row[]>(sql, params as any[]);
    return r[0] || {};
  };

  const purchases = await one(`SELECT COALESCE(SUM(total),0) AS v FROM purchase_invoices WHERE invoice_date LIKE ?`, [like]);
  const paid = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM invoice_payments WHERE paid_on LIKE ?`, [like]);
  const exp = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE expense_date LIKE ?`, [like]);
  const outstanding = await one(`SELECT COALESCE(SUM(total - amount_paid),0) AS v FROM purchase_invoices WHERE total - amount_paid > 0.005`);
  const overdue = await one(
    `SELECT COUNT(*) AS v FROM purchase_invoices WHERE total - amount_paid > 0.005 AND due_date <> '' AND due_date < ?`,
    [todayStr()]
  );
  const openPo = await one(`SELECT COUNT(*) AS v FROM purchase_orders WHERE status IN ('draft','ordered','partial')`);
  const stock = await one(
    `SELECT COALESCE(SUM(stock_qty * unit_cost),0) AS value, COALESCE(SUM(stock_qty <= reorder_level),0) AS low FROM medicines`
  );

  const [cats] = await pool.execute<Row[]>(
    `SELECT category, SUM(amount) AS amount FROM expenses WHERE expense_date LIKE ? GROUP BY category ORDER BY amount DESC`,
    [like]
  );

  // last 6 months, oldest → newest
  const trend: InventorySummary['trend'] = [];
  const [y, mo] = m.split('-').map(Number);
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(y, mo - 1 - k, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const p = await one(`SELECT COALESCE(SUM(total),0) AS v FROM purchase_invoices WHERE invoice_date LIKE ?`, [`${key}-%`]);
    const e = await one(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE expense_date LIKE ?`, [`${key}-%`]);
    trend.push({ month: key, purchases: round2(num(p.v)), expenses: round2(num(e.v)) });
  }

  return {
    month: m,
    purchasesThisMonth: round2(num(purchases.v)),
    paidThisMonth: round2(num(paid.v)),
    expensesThisMonth: round2(num(exp.v)),
    totalSpendThisMonth: round2(num(paid.v) + num(exp.v)),
    outstandingPayables: round2(num(outstanding.v)),
    overdueCount: num(overdue.v),
    openPoCount: num(openPo.v),
    lowStockCount: num(stock.low),
    stockValue: round2(num(stock.value)),
    expenseByCategory: cats.map((c) => ({ category: c.category, amount: round2(num(c.amount)) })),
    trend,
  };
}
