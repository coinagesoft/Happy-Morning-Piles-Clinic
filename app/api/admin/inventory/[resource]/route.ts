import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/adminAuth';
import {
  listSuppliers, saveSupplier, deleteSupplier,
  listStock, updateStockSettings, adjustStock, listMovements,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder,
  setPurchaseOrderStatus, receivePurchaseOrder, deletePurchaseOrder,
  listInvoices, getInvoice, saveInvoice, recordInvoicePayment, deleteInvoicePayment, deleteInvoice,
  listExpenses, saveExpense, deleteExpense,
  getInventorySummary,
} from '@/lib/inventory';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Ctx = { params: Promise<{ resource: string }> };

const ROLES = ['doctor', 'pharmacist'] as const; // super admin is always allowed

function guard(request: NextRequest) {
  const auth = verifyAdminRequest(request, [...ROLES]);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Unauthorized access.' }, { status: auth.statusCode || 401 });
  }
  return null;
}

function fail(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  // Business-rule errors thrown by lib/inventory.ts are user-facing → 400
  const isRule = err instanceof Error && !/ECONN|ER_|connect|socket/i.test(message);
  if (!isRule) console.error('[inventory]', err);
  return NextResponse.json({ error: isRule ? message : fallback }, { status: isRule ? 400 : 500 });
}

const unknown = () => NextResponse.json({ error: 'Unknown inventory resource.' }, { status: 404 });

export async function GET(request: NextRequest, ctx: Ctx) {
  const denied = guard(request);
  if (denied) return denied;
  const { resource } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  try {
    switch (resource) {
      case 'summary':
        return NextResponse.json({ summary: await getInventorySummary(sp.get('month') || undefined) });
      case 'stock':
        return NextResponse.json({ stock: await listStock(sp.get('q') || undefined) });
      case 'movements':
        return NextResponse.json({ movements: await listMovements(sp.get('medicineId') || undefined, Number(sp.get('limit')) || 100) });
      case 'suppliers':
        return NextResponse.json({ suppliers: await listSuppliers() });
      case 'purchase-orders': {
        const id = sp.get('id');
        if (id) {
          const po = await getPurchaseOrder(id);
          return po ? NextResponse.json({ purchaseOrder: po }) : NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
        }
        return NextResponse.json({ purchaseOrders: await listPurchaseOrders() });
      }
      case 'invoices': {
        const id = sp.get('id');
        if (id) {
          const inv = await getInvoice(id);
          return inv ? NextResponse.json({ invoice: inv }) : NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
        }
        return NextResponse.json({ invoices: await listInvoices() });
      }
      case 'expenses':
        return NextResponse.json({ expenses: await listExpenses(sp.get('from') || undefined, sp.get('to') || undefined) });
      default:
        return unknown();
    }
  } catch (err) {
    return fail(err, `Failed to load ${resource}.`);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const denied = guard(request);
  if (denied) return denied;
  const { resource } = await ctx.params;
  try {
    const body = await request.json();
    switch (resource) {
      case 'suppliers':
        return NextResponse.json({ success: true, supplier: await saveSupplier(body) }, { status: 201 });
      case 'stock':
        // { action: 'adjust', medicineId, delta, reason }
        if (body.action === 'adjust') {
          await adjustStock(String(body.medicineId || ''), Number(body.delta), String(body.reason || ''));
          return NextResponse.json({ success: true });
        }
        return unknown();
      case 'purchase-orders':
        if (body.action === 'receive') {
          return NextResponse.json({ success: true, purchaseOrder: await receivePurchaseOrder(String(body.id), body.lines || []) });
        }
        if (body.action === 'status') {
          await setPurchaseOrderStatus(String(body.id), body.status);
          return NextResponse.json({ success: true, purchaseOrder: await getPurchaseOrder(String(body.id)) });
        }
        return NextResponse.json({ success: true, purchaseOrder: await createPurchaseOrder(body) }, { status: 201 });
      case 'invoices':
        if (body.action === 'payment') {
          return NextResponse.json({ success: true, invoice: await recordInvoicePayment(String(body.id), body) });
        }
        if (body.action === 'delete-payment') {
          return NextResponse.json({ success: true, invoice: await deleteInvoicePayment(String(body.paymentId)) });
        }
        return NextResponse.json({ success: true, invoice: await saveInvoice(body) }, { status: 201 });
      case 'expenses':
        return NextResponse.json({ success: true, expense: await saveExpense(body) }, { status: 201 });
      default:
        return unknown();
    }
  } catch (err) {
    return fail(err, `Failed to save ${resource}.`);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const denied = guard(request);
  if (denied) return denied;
  const { resource } = await ctx.params;
  try {
    const body = await request.json();
    const id = String(body.id || '');
    switch (resource) {
      case 'suppliers':
        if (!id) return NextResponse.json({ error: 'Supplier id is required.' }, { status: 400 });
        return NextResponse.json({ success: true, supplier: await saveSupplier(body) });
      case 'stock':
        await updateStockSettings(String(body.medicineId || ''), body);
        return NextResponse.json({ success: true });
      case 'purchase-orders':
        return NextResponse.json({ success: true, purchaseOrder: await updatePurchaseOrder(id, body) });
      case 'invoices':
        return NextResponse.json({ success: true, invoice: await saveInvoice(body, id) });
      case 'expenses':
        return NextResponse.json({ success: true, expense: await saveExpense(body, id) });
      default:
        return unknown();
    }
  } catch (err) {
    return fail(err, `Failed to update ${resource}.`);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const denied = guard(request);
  if (denied) return denied;
  const { resource } = await ctx.params;
  const id = request.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  try {
    let ok = false;
    switch (resource) {
      case 'suppliers': ok = await deleteSupplier(id); break;
      case 'purchase-orders': ok = await deletePurchaseOrder(id); break;
      case 'invoices': ok = await deleteInvoice(id); break;
      case 'expenses': ok = await deleteExpense(id); break;
      default: return unknown();
    }
    return ok
      ? NextResponse.json({ success: true, id })
      : NextResponse.json({ error: 'Not found or already deleted.' }, { status: 404 });
  } catch (err) {
    return fail(err, `Failed to delete from ${resource}.`);
  }
}