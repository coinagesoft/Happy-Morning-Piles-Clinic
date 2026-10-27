import type { RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';
import { getPool, ensureDatabaseSchema } from './db';
import { MedicineCategory, DEFAULT_MEDICINE_CATEGORIES } from './medicineConstants';

export type { MedicineCategory };
export { DEFAULT_MEDICINE_CATEGORIES };

interface CategoryRow extends RowDataPacket {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  medicine_count?: number | string;
}

/** Ensures the medicine_categories table has default records and absorbs any existing categories from medicines */
export async function ensureCategoriesInitialized(): Promise<void> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const [existing] = await pool.execute<CategoryRow[]>(
    `SELECT id, name FROM medicine_categories LIMIT 1`
  );

  const now = new Date().toISOString();

  // If table is empty, seed defaults
  if (existing.length === 0) {
    for (const cat of DEFAULT_MEDICINE_CATEGORIES) {
      const id = crypto.randomUUID();
      try {
        await pool.execute(
          `INSERT IGNORE INTO medicine_categories (id, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [id, cat.name, cat.description, now, now]
        );
      } catch {
        // ignore duplicate key in race condition
      }
    }
  }

  // Also check if any medicines have a category not yet in medicine_categories
  try {
    const [orphanRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT TRIM(category) as cat_name 
       FROM medicines 
       WHERE category IS NOT NULL AND TRIM(category) != ''`
    );

    for (const r of orphanRows) {
      const catName = String(r.cat_name || '').trim();
      if (!catName) continue;

      const [check] = await pool.execute<CategoryRow[]>(
        `SELECT id FROM medicine_categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
        [catName]
      );

      if (check.length === 0) {
        const id = crypto.randomUUID();
        await pool.execute(
          `INSERT IGNORE INTO medicine_categories (id, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [id, catName, '', now, now]
        );
      }
    }
  } catch (err) {
    console.error('[medicineCategories] ensure sync warning:', err);
  }
}

/** Get all medicine categories with their remedy counts */
export async function getAllCategories(): Promise<MedicineCategory[]> {
  await ensureCategoriesInitialized();
  const pool = getPool();

  const [rows] = await pool.execute<CategoryRow[]>(`
    SELECT 
      c.id,
      c.name,
      c.description,
      c.created_at,
      c.updated_at,
      COUNT(m.id) AS medicine_count
    FROM medicine_categories c
    LEFT JOIN medicines m ON LOWER(TRIM(m.category)) = LOWER(TRIM(c.name))
    GROUP BY c.id, c.name, c.description, c.created_at, c.updated_at
    ORDER BY c.name ASC
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    medicineCount: Number(r.medicine_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Create a single category manually */
export async function createCategory(input: {
  name: string;
  description?: string;
}): Promise<MedicineCategory> {
  await ensureDatabaseSchema();
  const pool = getPool();
  const trimmedName = input.name.trim();

  if (!trimmedName) {
    throw new Error('Category name cannot be empty.');
  }

  // Check duplicate
  const [existing] = await pool.execute<CategoryRow[]>(
    `SELECT id, name, description, created_at, updated_at FROM medicine_categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    [trimmedName]
  );

  const now = new Date().toISOString();

  if (existing.length > 0) {
    // If it exists, update description if provided and return
    const current = existing[0];
    const newDesc = input.description !== undefined ? input.description.trim() : (current.description || '');
    await pool.execute(
      `UPDATE medicine_categories SET description = ?, updated_at = ? WHERE id = ?`,
      [newDesc, now, current.id]
    );

    const [updated] = await pool.execute<CategoryRow[]>(
      `SELECT c.*, COUNT(m.id) as medicine_count 
       FROM medicine_categories c 
       LEFT JOIN medicines m ON LOWER(TRIM(m.category)) = LOWER(TRIM(c.name))
       WHERE c.id = ?
       GROUP BY c.id`,
      [current.id]
    );

    const r = updated[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      medicineCount: Number(r.medicine_count || 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO medicine_categories (id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, trimmedName, input.description?.trim() || '', now, now]
  );

  return {
    id,
    name: trimmedName,
    description: input.description?.trim() || '',
    medicineCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Update / Rename a category */
export async function updateCategory(
  id: string,
  input: { name?: string; description?: string }
): Promise<MedicineCategory> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const [existing] = await pool.execute<CategoryRow[]>(
    `SELECT * FROM medicine_categories WHERE id = ? LIMIT 1`,
    [id]
  );

  if (existing.length === 0) {
    throw new Error('Category not found.');
  }

  const current = existing[0];
  const oldName = current.name;
  const newName = input.name !== undefined ? input.name.trim() : oldName;
  const newDesc = input.description !== undefined ? input.description.trim() : (current.description || '');

  if (!newName) {
    throw new Error('Category name cannot be empty.');
  }

  // Check uniqueness conflict if name changed
  if (newName.toLowerCase() !== oldName.toLowerCase()) {
    const [conflict] = await pool.execute<CategoryRow[]>(
      `SELECT id FROM medicine_categories WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1`,
      [newName, id]
    );
    if (conflict.length > 0) {
      throw new Error(`Another category with the name "${newName}" already exists.`);
    }
  }

  const now = new Date().toISOString();

  await pool.execute(
    `UPDATE medicine_categories 
     SET name = ?, description = ?, updated_at = ? 
     WHERE id = ?`,
    [newName, newDesc, now, id]
  );

  // If name changed, synchronize all existing medicines using the old category name!
  if (newName !== oldName) {
    await pool.execute(
      `UPDATE medicines 
       SET category = ?, updated_at = ? 
       WHERE LOWER(TRIM(category)) = LOWER(TRIM(?))`,
      [newName, now, oldName]
    );
  }

  const [updated] = await pool.execute<CategoryRow[]>(
    `SELECT c.*, COUNT(m.id) as medicine_count 
     FROM medicine_categories c 
     LEFT JOIN medicines m ON LOWER(TRIM(m.category)) = LOWER(TRIM(c.name))
     WHERE c.id = ?
     GROUP BY c.id`,
    [id]
  );

  const r = updated[0];
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    medicineCount: Number(r.medicine_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Delete a category and optionally reassign medicines to 'General' */
export async function deleteCategory(id: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const pool = getPool();

  const [existing] = await pool.execute<CategoryRow[]>(
    `SELECT * FROM medicine_categories WHERE id = ? LIMIT 1`,
    [id]
  );

  if (existing.length === 0) {
    return false;
  }

  const catName = existing[0].name;
  const now = new Date().toISOString();

  // Reassign any medicines in this category to 'General' so they are not left orphan
  await pool.execute(
    `UPDATE medicines 
     SET category = 'General', updated_at = ? 
     WHERE LOWER(TRIM(category)) = LOWER(TRIM(?))`,
    [now, catName]
  );

  const [result] = await pool.execute(
    `DELETE FROM medicine_categories WHERE id = ?`,
    [id]
  );

  return (result as { affectedRows?: number }).affectedRows ? true : false;
}

/** Bulk import categories from parsed Excel/CSV rows */
export async function bulkImportCategories(
  items: Array<{ name: string; description?: string }>
): Promise<{ added: number; updated: number; totalProcessed: number }> {
  await ensureDatabaseSchema();
  const pool = getPool();

  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const item of items) {
    const rawName = String(item.name || '').trim();
    if (!rawName) continue;

    const desc = String(item.description || '').trim();

    // Check if category already exists
    const [existing] = await pool.execute<CategoryRow[]>(
      `SELECT id, description FROM medicine_categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [rawName]
    );

    if (existing.length > 0) {
      if (desc) {
        await pool.execute(
          `UPDATE medicine_categories SET description = ?, updated_at = ? WHERE id = ?`,
          [desc, now, existing[0].id]
        );
      }
      updated++;
    } else {
      const id = crypto.randomUUID();
      await pool.execute(
        `INSERT INTO medicine_categories (id, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, rawName, desc, now, now]
      );
      added++;
    }
  }

  return { added, updated, totalProcessed: items.length };
}

