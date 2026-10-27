import type { RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';
import { getPool, ensureDatabaseSchema } from './db';

export interface Medicine {
  id: string;
  name: string;
  potency: string;
  form: string;
  category: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface MedicineRow extends RowDataPacket {
  id: string;
  name: string;
  potency: string | null;
  form: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: MedicineRow): Medicine {
  return {
    id: r.id,
    name: r.name,
    potency: r.potency || '',
    form: r.form || 'Dilution',
    category: r.category || 'General',
    notes: r.notes || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getAllMedicines(search?: string): Promise<Medicine[]> {
  await ensureDatabaseSchema();
  const pool = getPool();

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    const [rows] = await pool.execute<MedicineRow[]>(
      `SELECT * FROM medicines 
       WHERE name LIKE ? 
          OR category LIKE ? 
          OR potency LIKE ? 
          OR form LIKE ? 
          OR notes LIKE ?
       ORDER BY name ASC`,
      [q, q, q, q, q]
    );
    return rows.map(mapRow);
  }

  const [rows] = await pool.execute<MedicineRow[]>(
    `SELECT * FROM medicines ORDER BY name ASC`
  );
  return rows.map(mapRow);
}

export async function getMedicineById(id: string): Promise<Medicine | null> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<MedicineRow[]>(
    `SELECT * FROM medicines WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length ? mapRow(rows[0]) : null;
}

export async function createMedicine(input: {
  name: string;
  potency?: string;
  form?: string;
  category?: string;
  notes?: string;
}): Promise<Medicine> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Medicine name cannot be empty.');
  }

  // Check if medicine with this name already exists
  const [existing] = await pool.execute<MedicineRow[]>(
    `SELECT id, potency, form, category, notes FROM medicines WHERE name = ? LIMIT 1`,
    [trimmedName]
  );

  const now = new Date().toISOString();

  if (existing.length > 0) {
    // Update existing record
    const id = existing[0].id;
    const current = existing[0];
    const newPotency = input.potency?.trim() || current.potency || '';
    const newForm = input.form?.trim() || current.form || 'Dilution';
    const newCategory = input.category?.trim() || current.category || 'General';
    const newNotes = input.notes?.trim() || current.notes || '';

    await pool.execute(
      `UPDATE medicines 
       SET potency = ?,
           form = ?,
           category = ?,
           notes = ?,
           updated_at = ?
       WHERE id = ?`,
      [newPotency, newForm, newCategory, newNotes, now, id]
    );
    const updated = await getMedicineById(id);
    return updated!;
  }

  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO medicines (id, name, potency, form, category, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      trimmedName,
      input.potency?.trim() || '',
      input.form?.trim() || 'Dilution',
      input.category?.trim() || 'General',
      input.notes?.trim() || '',
      now,
      now,
    ]
  );

  const created = await getMedicineById(id);

  // Ensure category is registered in medicine_categories
  if (input.category && input.category.trim()) {
    try {
      const catName = input.category.trim();
      const [catCheck] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM medicine_categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
        [catName]
      );
      if (catCheck.length === 0) {
        await pool.execute(
          `INSERT IGNORE INTO medicine_categories (id, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), catName, '', now, now]
        );
      }
    } catch {
      // ignore
    }
  }

  return created!;
}

export async function updateMedicine(
  id: string,
  input: {
    name?: string;
    potency?: string;
    form?: string;
    category?: string;
    notes?: string;
  }
): Promise<Medicine> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const existing = await getMedicineById(id);
  if (!existing) {
    throw new Error('Medicine not found.');
  }

  const newName = input.name !== undefined ? input.name.trim() : existing.name;
  if (!newName) {
    throw new Error('Medicine name cannot be empty.');
  }

  const now = new Date().toISOString();

  await pool.execute(
    `UPDATE medicines 
     SET name = ?,
         potency = ?,
         form = ?,
         category = ?,
         notes = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      newName,
      input.potency !== undefined ? input.potency.trim() : existing.potency,
      input.form !== undefined ? input.form.trim() : existing.form,
      input.category !== undefined ? input.category.trim() : existing.category,
      input.notes !== undefined ? input.notes.trim() : existing.notes,
      now,
      id,
    ]
  );

  const updated = await getMedicineById(id);
  return updated!;
}

export async function deleteMedicine(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const [result] = await getPool().execute(
    `DELETE FROM medicines WHERE id = ?`,
    [id]
  );
  return (result as { affectedRows?: number }).affectedRows ? true : false;
}

export async function bulkImportMedicines(
  items: Array<{
    name: string;
    potency?: string;
    form?: string;
    category?: string;
    notes?: string;
  }>
): Promise<{ added: number; updated: number; totalProcessed: number }> {
  await ensureDatabaseSchema();
  const pool = getPool();

  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const item of items) {
    const rawName = String(item.name || '').trim();
    if (!rawName) continue;

    const potency = String(item.potency || '').trim();
    const form = String(item.form || 'Dilution').trim();
    const category = String(item.category || 'General').trim();
    const notes = String(item.notes || '').trim();

    // Check if exists
    const [existing] = await pool.execute<MedicineRow[]>(
      `SELECT id, potency, form, category, notes FROM medicines WHERE name = ? LIMIT 1`,
      [rawName]
    );

    if (existing.length > 0) {
      const current = existing[0];
      const updatedPotency = potency || current.potency || '';
      const updatedForm = form || current.form || 'Dilution';
      const updatedCategory = category || current.category || 'General';
      const updatedNotes = notes || current.notes || '';

      await pool.execute(
        `UPDATE medicines 
         SET potency = ?,
             form = ?,
             category = ?,
             notes = ?,
             updated_at = ?
         WHERE id = ?`,
        [updatedPotency, updatedForm, updatedCategory, updatedNotes, now, current.id]
      );
      updated++;
    } else {
      const id = crypto.randomUUID();
      await pool.execute(
        `INSERT INTO medicines (id, name, potency, form, category, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, rawName, potency, form, category, notes, now, now]
      );
      added++;
    }

    // Ensure category exists in medicine_categories
    if (category) {
      try {
        const [catCheck] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM medicine_categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
          [category]
        );
        if (catCheck.length === 0) {
          await pool.execute(
            `INSERT IGNORE INTO medicine_categories (id, name, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), category, '', now, now]
          );
        }
      } catch {
        // ignore
      }
    }
  }

  return { added, updated, totalProcessed: items.length };
}

/** Get list of all medicine names for prescription type-ahead datalist */
export async function getAllMedicineNames(): Promise<string[]> {
  await ensureDatabaseSchema();
  const [rows] = await getPool().execute<MedicineRow[]>(
    `SELECT name FROM medicines ORDER BY name ASC`
  );
  return rows.map((r) => r.name);
}
