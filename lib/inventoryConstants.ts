// Client-safe types & constants for Inventory / Purchase Orders / Invoices / Expenses.
// (No database imports here so React components can use it.)

export const PO_STATUSES = ['draft', 'ordered', 'partial', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'] as const;

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity & Water',
  'Salaries',
  'Consumables & Supplies',
  'Equipment & Repairs',
  'Transport & Courier',
  'Marketing',
  'Professional Fees',
  'Licences & Taxes',
  'Other',
] as const;

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockItem {
  id: string;
  name: string;
  potency: string;
  form: string;
  category: string;
  stockQty: number;
  reorderLevel: number;
  unitCost: number;
  stockValue: number;
  isLow: boolean;
}

export interface StockMovement {
  id: string;
  medicineId: string;
  medicineName: string;
  type: 'purchase' | 'adjustment';
  qtyChange: number;
  reference: string;
  reason: string;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  medicineId: string | null;
  medicineName: string;
  potency: string;
  form: string;
  quantity: number;
  receivedQty: number;
  unitCost: number;
  taxPercent: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string | null;
  supplierName: string;
  orderDate: string;
  expectedDate: string;
  status: PoStatus;
  notes: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  itemCount: number;
  items?: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  paidOn: string;
  reference: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  supplierId: string | null;
  supplierName: string;
  poId: string | null;
  poNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balance: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  isOverdue: boolean;
  notes: string;
  payments?: InvoicePayment[];
  createdAt: string;
}

export interface Expense {
  id: string;
  expenseDate: string;
  category: string;
  description: string;
  vendor: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  createdAt: string;
}

export interface InventorySummary {
  month: string; // YYYY-MM
  purchasesThisMonth: number;
  paidThisMonth: number;
  expensesThisMonth: number;
  totalSpendThisMonth: number; // invoice payments + other expenses
  outstandingPayables: number;
  overdueCount: number;
  openPoCount: number;
  lowStockCount: number;
  stockValue: number;
  expenseByCategory: Array<{ category: string; amount: number }>;
  trend: Array<{ month: string; purchases: number; expenses: number }>;
}
