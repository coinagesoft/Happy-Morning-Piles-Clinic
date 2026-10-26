import type { RowDataPacket } from 'mysql2/promise';
import { getPool, ensureDatabaseSchema } from './db';
import { CLINIC_INFO, Letterhead, normalizeLetterhead } from './prescriptionTemplate';

interface LetterheadRow extends RowDataPacket {
  data: string | null;
}

/** The letterhead printed on prescription PDFs: the saved one, or the built-in default. */
export async function getLetterhead(): Promise<Letterhead> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await getPool().execute<LetterheadRow[]>(`SELECT data FROM prescription_letterhead WHERE id = 1`);
    if (rows.length && rows[0].data) {
      return normalizeLetterhead(JSON.parse(rows[0].data));
    }
  } catch (err) {
    console.error('[letterhead] load failed, using defaults:', err);
  }
  return { ...CLINIC_INFO };
}

export async function isLetterheadCustomised(): Promise<boolean> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await getPool().execute<LetterheadRow[]>(`SELECT data FROM prescription_letterhead WHERE id = 1`);
    return rows.length > 0 && !!rows[0].data;
  } catch {
    return false;
  }
}

export async function saveLetterhead(input: unknown): Promise<Letterhead> {
  const lh = normalizeLetterhead(input);
  await ensureDatabaseSchema();
  await getPool().execute(
    `INSERT INTO prescription_letterhead (id, data, updated_at) VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)`,
    [JSON.stringify(lh), new Date().toISOString()]
  );
  return lh;
}

export async function resetLetterhead(): Promise<Letterhead> {
  await ensureDatabaseSchema();
  await getPool().execute(`DELETE FROM prescription_letterhead WHERE id = 1`);
  return { ...CLINIC_INFO };
}
